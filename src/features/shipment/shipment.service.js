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
  // Métodos de envio escolhidos pelo vendedor no anúncio (array de `code` em
  // metadata.shipping_methods). Quando presente, filtra as opções de frete.
  let allowedMethods = null;
  // Cotação direto pelo produto (página do produto): deriva origem (CEP do
  // vendedor → CEP de origem padrão) e dimensões/peso do próprio produto.
  if (product_id) {
    const product = await db.Product.findByPk(product_id, {
      include: [{ model: db.User, as: 'seller', attributes: ['zip_code'] }],
    });
    if (product) {
      const meta = product.metadata || {};
      if (Array.isArray(meta.shipping_methods) && meta.shipping_methods.length) {
        allowedMethods = meta.shipping_methods.map((m) => String(m));
      }
    }
    if (product && (!from_zip || !Array.isArray(products) || !products.length)) {
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
  // Sem origem informada (ex.: calculadora genérica da página de frete): usa o
  // CEP de origem padrão do painel.
  if (!from_zip) {
    const cfgOrigin = await settings.shipping();
    from_zip = cfgOrigin && cfgOrigin.default_origin_zip;
  }
  if (!from_zip) {
    throw AppError.unprocessable(
      'CEP de origem não definido. Configure o CEP de origem no painel (Frete) ou no perfil do vendedor.',
      'SHIPPING_NO_ORIGIN'
    );
  }
  // Calculadora genérica: assume um pacote padrão (1kg) quando nenhum produto é informado.
  if (!Array.isArray(products) || !products.length) {
    products = [{ weight: 1, height: 6, width: 16, length: 24, insurance_value: Number(order_amount) || 0, quantity: 1 }];
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
      company_picture: svc.company ? svc.company.picture : null,
      base_price: round2(basePrice),
      price: freeShipping ? 0 : withMarkup,
      free_shipping: freeShipping,
      delivery_time: svc.delivery_time,
      currency: 'BRL',
    });
  }

  // Restringe às transportadoras que o vendedor habilitou no anúncio
  // (metadata.shipping_methods). Compara como String. Se o filtro zerar tudo
  // (métodos antigos/incompatíveis), NÃO filtra — para nunca deixar o comprador
  // sem opção de frete.
  if (allowedMethods && allowedMethods.length) {
    const filtered = options.filter((o) => allowedMethods.includes(String(o.service_code)));
    if (filtered.length) return filtered;
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

/** Normaliza o CEP (só dígitos). */
function normalizeZip(zip) {
  return zip ? String(zip).replace(/\D/g, '') : null;
}

/**
 * Gera a ETIQUETA DE DEVOLUÇÃO (frete reverso): origem = COMPRADOR (endereço de
 * entrega em order.metadata.shipping_address), destino = VENDEDOR (cadastro do
 * User do seller). Cota o reverso, escolhe a opção mais barata (ou reusa a
 * service do envio original, se presente em order.metadata.shipping_option),
 * cria um Shipment marcado como retorno (payload.reversed = true) e gera a
 * etiqueta reusando o fluxo addToCart→checkout→generate→print.
 *
 * Quem paga o reverso é o vendedor (arrependimento/defeito) — apenas registrado;
 * sem cobrança extra no fluxo atual.
 *
 * @param {string} orderId
 * @returns {Promise<{label_url, tracking_code, service_name, price, shipment_id}>}
 */
async function generateReturnLabel(orderId) {
  const order = await db.Order.findByPk(orderId, {
    include: [
      { model: db.User, as: 'seller' },
      { model: db.OrderItem, as: 'items', include: [{ model: db.Product, as: 'product' }] },
    ],
  });
  if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');

  const seller = order.seller;
  if (!seller) throw AppError.notFound('Vendedor do pedido não encontrado.', 'ORDER_SELLER_NOT_FOUND');

  const metadata = order.metadata || {};
  const buyerAddr = metadata.shipping_address || null;
  if (!buyerAddr || !(buyerAddr.cep || buyerAddr.zip_code)) {
    throw AppError.unprocessable(
      'Endereço de entrega do comprador indisponível para gerar a devolução.',
      'RETURN_MISSING_BUYER_ADDRESS'
    );
  }
  if (!seller.zip_code) {
    throw AppError.unprocessable(
      'O vendedor não possui endereço (CEP) cadastrado para receber a devolução.',
      'RETURN_MISSING_SELLER_ADDRESS'
    );
  }

  const buyerZip = normalizeZip(buyerAddr.cep || buyerAddr.zip_code);
  const sellerZip = normalizeZip(seller.zip_code);

  // from = COMPRADOR (origem da devolução); to = VENDEDOR (destino).
  const fromAddress = {
    name: buyerAddr.recipient || order.order_number || 'Comprador',
    postal_code: buyerZip,
    zip_code: buyerZip,
    address: buyerAddr.street || null,
    street: buyerAddr.street || null,
    number: buyerAddr.number || null,
    complement: buyerAddr.complement || null,
    district: buyerAddr.neighborhood || null,
    neighborhood: buyerAddr.neighborhood || null,
    city: buyerAddr.city || null,
    state_abbr: buyerAddr.state || null,
    state: buyerAddr.state || null,
  };
  const toAddress = {
    name: seller.name || 'Vendedor',
    postal_code: sellerZip,
    zip_code: sellerZip,
    address: seller.street || null,
    street: seller.street || null,
    number: seller.number || null,
    complement: seller.complement || null,
    district: seller.neighborhood || null,
    neighborhood: seller.neighborhood || null,
    city: seller.city || null,
    state_abbr: seller.state || null,
    state: seller.state || null,
  };

  // Dimensões/peso a partir dos produtos do pedido (defaults se faltar).
  const items = Array.isArray(order.items) ? order.items : [];
  const products = items.length
    ? items.map((it) => {
        const p = it.product || {};
        const dim = p.dimensions || {};
        return {
          weight: (Number(p.weight_grams) || 500) / 1000,
          height: Number(dim.height) || 4,
          width: Number(dim.width) || 12,
          length: Number(dim.length) || 16,
          insurance_value: Number(it.unit_price) || 0,
          quantity: Math.max(1, Number(it.quantity) || 1),
        };
      })
    : [{ weight: 0.5, height: 4, width: 12, length: 16, insurance_value: Number(order.total) || 0, quantity: 1 }];

  // Cotação do reverso (lança SHIPPING_NOT_CONFIGURED se o ME não estiver pronto).
  const options = await quote({
    from_zip: buyerZip,
    to_zip: sellerZip,
    products,
    order_amount: Number(order.total) || 0,
  });
  if (!Array.isArray(options) || !options.length) {
    throw AppError.unprocessable(
      'Nenhuma opção de frete reverso disponível para esses endereços.',
      'RETURN_NO_SHIPPING_OPTION'
    );
  }

  // Reusa a service do envio original, se existir; senão a mais barata.
  const originalCode = metadata.shipping_option && metadata.shipping_option.service_code
    ? String(metadata.shipping_option.service_code)
    : null;
  let chosen = originalCode ? options.find((o) => String(o.service_code) === originalCode) : null;
  if (!chosen) {
    chosen = options.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
  }

  // Cria o Shipment de retorno (endereços invertidos), marcado como reversed.
  const shipment = await db.Shipment.create({
    order_id: order.id,
    provider: 'melhor_envio',
    service_code: chosen.service_code || null,
    service_name: `Retorno: ${chosen.service_name || ''}`.trim(),
    cost: chosen.price != null ? round2(chosen.price) : null,
    status: 'pending',
    from_address: fromAddress,
    to_address: toAddress,
    dimensions: products[0],
    payload: { reversed: true, return_label: true, base_price: chosen.base_price, paid_by: 'seller' },
  });

  // Gera a etiqueta reusando o fluxo padrão (addToCart→checkout→generate→print).
  const labeled = await generateLabel(shipment.id);

  return {
    shipment_id: labeled.id,
    label_url: labeled.label_url || null,
    tracking_code: labeled.tracking_code || null,
    service_name: chosen.service_name || null,
    price: chosen.price != null ? round2(chosen.price) : null,
  };
}

// Transportadoras/serviços do Melhor Envio (cache 6h) — para o formulário de anúncio
// escolher quais oferecer. Cai num conjunto padrão se a integração não responder.
const FALLBACK_CARRIERS = [
  { code: '1', name: 'Correios PAC', company: 'Correios', description: 'Mais econômico' },
  { code: '2', name: 'Correios SEDEX', company: 'Correios', description: 'Mais rápido' },
  { code: '3', name: 'Jadlog .Package', company: 'Jadlog', description: 'Econômico' },
  { code: '4', name: 'Jadlog .Com', company: 'Jadlog', description: 'Expresso' },
  { code: '17', name: 'Loggi', company: 'Loggi', description: 'Regiões metropolitanas' },
];
let _carriersCache = null;
let _carriersAt = 0;
async function listCarriers() {
  if (_carriersCache && Date.now() - _carriersAt < 6 * 3600 * 1000) return _carriersCache;
  let services = [];
  try {
    services = await melhorenvio.listServices();
  } catch (err) {
    logger.warn(`listCarriers: Melhor Envio indisponível (${err.message}); usando fallback.`);
    return FALLBACK_CARRIERS;
  }
  const carriers = (Array.isArray(services) ? services : [])
    .filter((s) => s && s.id && s.name)
    .map((s) => ({
      code: String(s.id),
      name: s.company && s.company.name ? `${s.company.name} ${s.name}` : s.name,
      company: s.company ? s.company.name : null,
      picture: s.company ? s.company.picture : null,
      description: s.type ? `Serviço ${s.type}` : null,
    }));
  if (carriers.length) {
    _carriersCache = carriers;
    _carriersAt = Date.now();
    return carriers;
  }
  return FALLBACK_CARRIERS;
}

module.exports = {
  quote,
  createForOrder,
  generateLabel,
  generateReturnLabel,
  track,
  getById,
  listCarriers,
};
