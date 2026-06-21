'use strict';

/**
 * Serviço de Envios (Melhor Envio). A cotação bruta vem do provider; aqui
 * aplicamos o MARKUP dinâmico (shipping_settings) e respeitamos os limites
 * operacionais (peso/valor declarado). Gera etiqueta e rastreia envios.
 */
const db = require('../../models');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const settings = require('../../services/settings.cache');
const melhorenvio = require('../../providers/melhor-envio/melhorenvio.provider');
const zapi = require('../../providers/zapi/zapi.provider');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Cotação de frete com markup e frete grátis dinâmicos (shipping_settings).
 * @param {object} p { from_zip, to_zip, products:[{ weight, width, height, length, quantity, insurance_value }],
 *   order_amount, category_ids } — order_amount/category_ids habilitam as regras de frete grátis.
 */
async function quote({ from_zip, to_zip, products, order_amount, category_ids, product_id, quantity } = {}) {
  // Cotação direto pelo produto (página do produto): deriva origem (CEP do
  // vendedor → CEP de origem padrão) e dimensões/peso do próprio produto.
  if (product_id && (!from_zip || !Array.isArray(products) || !products.length)) {
    const product = await db.Product.findByPk(product_id, {
      include: [{ model: db.User, as: 'seller', attributes: ['zip_code'] }],
    });
    if (product) {
      const cfgOrigin = await settings.shipping();
      if (!from_zip) {
        from_zip = (product.seller && product.seller.zip_code) || (cfgOrigin && cfgOrigin.default_origin_zip) || null;
      }
      if (!Array.isArray(products) || !products.length) {
        const dim = product.dimensions || {};
        products = [
          {
            weight: (Number(product.weight_grams) || 500) / 1000,
            height: Number(dim.height) || 4,
            width: Number(dim.width) || 12,
            length: Number(dim.length) || 17,
            insurance_value: Number(product.promotional_price != null ? product.promotional_price : product.price) || 0,
            quantity: Math.max(1, Number(quantity) || 1),
          },
        ];
      }
      if (order_amount == null) order_amount = Number(product.promotional_price != null ? product.promotional_price : product.price) || 0;
      if (!category_ids && product.category_id) category_ids = [product.category_id];
    }
  }

  if (!to_zip) {
    throw AppError.unprocessable('Informe o CEP de destino.', 'SHIPPING_MISSING_ZIP');
  }
  if (!from_zip) {
    throw AppError.unprocessable(
      'CEP de origem não definido. Configure o CEP de origem no painel (Frete) ou no perfil do vendedor.',
      'SHIPPING_NO_ORIGIN'
    );
  }
  if (!Array.isArray(products) || !products.length) {
    throw AppError.unprocessable('Informe ao menos um produto para cotação.', 'SHIPPING_NO_PRODUCTS');
  }

  let raw;
  try {
    raw = await melhorenvio.quote({
      from: { postal_code: String(from_zip) },
      to: { postal_code: String(to_zip) },
      products,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 503) {
      throw new AppError(
        'Cotação de frete indisponível. A integração de envio não está configurada.',
        503,
        'SHIPPING_NOT_CONFIGURED'
      );
    }
    throw err;
  }

  const cfg = await settings.shipping();
  const markupPercent = cfg ? Number(cfg.markup_percent || 0) : 0;
  const markupFixed = cfg ? Number(cfg.markup_fixed || 0) : 0;
  const maxWeight = cfg && cfg.max_weight_grams != null ? Number(cfg.max_weight_grams) : null;
  const maxDeclared = cfg && cfg.max_declared_value != null ? Number(cfg.max_declared_value) : null;

  // Soma de peso/valor declarado dos produtos cotados (para filtrar por limites).
  const totalWeightGrams = products.reduce(
    (s, p) => s + Number(p.weight || 0) * 1000 * Number(p.quantity || 1),
    0
  );
  const totalDeclared = products.reduce(
    (s, p) => s + Number(p.insurance_value || 0) * Number(p.quantity || 1),
    0
  );

  // Frete grátis dinâmico (regras do admin em shipping_settings).
  const freeEnabled = !!(cfg && cfg.free_shipping_enabled);
  const minOrder = cfg && cfg.free_shipping_min_order != null ? Number(cfg.free_shipping_min_order) : null;
  const freeCats = cfg && Array.isArray(cfg.free_shipping_categories) ? cfg.free_shipping_categories : null;
  const meetsMin = minOrder == null || Number(order_amount || 0) >= minOrder;
  const catEligible =
    !freeCats || !freeCats.length || (Array.isArray(category_ids) && category_ids.some((c) => freeCats.includes(c)));
  const freeShipping = freeEnabled && meetsMin && catEligible;

  const services = Array.isArray(raw) ? raw : [];
  const options = [];
  for (const svc of services) {
    // Serviços com erro do provedor não têm price.
    if (svc.error || svc.price == null) continue;
    if (maxWeight != null && totalWeightGrams > maxWeight) continue;
    if (maxDeclared != null && totalDeclared > maxDeclared) continue;

    const basePrice = Number(svc.price);
    const withMarkup = round2(basePrice * (1 + markupPercent / 100) + markupFixed);

    options.push({
      service_code: String(svc.id),
      service_name: svc.name,
      company: svc.company ? svc.company.name : null,
      base_price: round2(basePrice),
      price: freeShipping ? 0 : withMarkup,
      free_shipping: freeShipping,
      delivery_time: svc.delivery_time,
      currency: 'BRL',
    });
  }

  return options;
}

/** Cria um registro de envio (pending) para um pedido. */
async function createForOrder(orderId, data = {}, user) {
  const order = await db.Order.findByPk(orderId);
  if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');
  if (user && order.seller_id !== user.id && user.is_admin !== true) {
    throw AppError.forbidden('Apenas o vendedor pode criar o envio.', 'NOT_ORDER_SELLER');
  }

  return db.Shipment.create({
    order_id: orderId,
    provider: 'melhor_envio',
    service_code: data.service_code || null,
    service_name: data.service_name || null,
    cost: data.cost != null ? round2(data.cost) : null,
    status: 'pending',
    from_address: data.from_address || null,
    to_address: data.to_address || null,
    dimensions: data.dimensions || null,
  });
}

/** Gera a etiqueta no Melhor Envio (checkout + generate + print). */
async function generateLabel(shipmentId) {
  const shipment = await db.Shipment.findByPk(shipmentId);
  if (!shipment) throw AppError.notFound('Envio não encontrado.', 'SHIPMENT_NOT_FOUND');

  // Verificação por WhatsApp do vendedor antes de gerar a etiqueta (configurável;
  // default OFF até a Z-API estar configurada). A facial foi movida para o app.
  const requirePhone = await settings.getBool('verification.require_phone_for_shipping', false);
  if (requirePhone && (await zapi.isConfigured()) && shipment.order_id) {
    const order = await db.Order.findByPk(shipment.order_id);
    if (order) {
      const seller = await db.User.findByPk(order.seller_id);
      if (seller && !seller.phone_verified_at) {
        throw new AppError(
          'Confirme seu WhatsApp para gerar etiquetas de postagem.',
          403,
          'PHONE_NOT_VERIFIED'
        );
      }
    }
  }

  try {
    // Caso o envio ainda não exista no provedor, adiciona ao carrinho.
    let externalId = shipment.external_id;
    if (!externalId) {
      const cartPayload = {
        service: shipment.service_code,
        from: shipment.from_address,
        to: shipment.to_address,
        products: shipment.dimensions ? [shipment.dimensions] : [],
      };
      const cart = await melhorenvio.addToCart(cartPayload);
      externalId = cart && cart.id ? cart.id : null;
    }
    if (!externalId) {
      throw new AppError('Não foi possível registrar o envio no provedor.', 502, 'SHIPPING_CART_FAILED');
    }

    await melhorenvio.checkout([externalId]);
    await melhorenvio.generateLabel([externalId]);
    const printed = await melhorenvio.printLabel([externalId]);

    await shipment.update({
      external_id: String(externalId),
      label_url: printed && printed.url ? printed.url : shipment.label_url,
      status: 'posted',
      posted_at: new Date(),
    });

    return shipment;
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 503) {
      throw new AppError(
        'Geração de etiqueta indisponível. A integração de envio não está configurada.',
        503,
        'SHIPPING_NOT_CONFIGURED'
      );
    }
    throw err;
  }
}

/** Consulta rastreamento e atualiza o status do envio. */
async function track(shipmentId) {
  const shipment = await db.Shipment.findByPk(shipmentId);
  if (!shipment) throw AppError.notFound('Envio não encontrado.', 'SHIPMENT_NOT_FOUND');
  if (!shipment.external_id) {
    throw AppError.conflict('Envio ainda não possui etiqueta gerada.', 'SHIPMENT_NOT_POSTED');
  }

  let tracking;
  try {
    tracking = await melhorenvio.track([shipment.external_id]);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 503) {
      throw new AppError(
        'Rastreamento indisponível. A integração de envio não está configurada.',
        503,
        'SHIPPING_NOT_CONFIGURED'
      );
    }
    throw err;
  }

  // O Melhor Envio retorna um objeto indexado pelo id do envio.
  const info = tracking && (tracking[shipment.external_id] || tracking);
  const status = info && info.status ? info.status : null;
  const patch = {};
  if (status === 'delivered') {
    patch.status = 'delivered';
    patch.delivered_at = new Date();
  } else if (status === 'posted' || status === 'released') {
    patch.status = 'posted';
  } else if (status) {
    patch.status = 'in_transit';
  }
  if (info && info.tracking) patch.tracking_code = info.tracking;
  if (Object.keys(patch).length) {
    try {
      await shipment.update(patch);
    } catch (err) {
      logger.warn('track: falha ao atualizar status do envio:', err.message);
    }
  }

  return { shipment, tracking: info };
}

async function getById(id) {
  const shipment = await db.Shipment.findByPk(id);
  if (!shipment) throw AppError.notFound('Envio não encontrado.', 'SHIPMENT_NOT_FOUND');
  return shipment;
}

module.exports = {
  quote,
  createForOrder,
  generateLabel,
  track,
  getById,
};
