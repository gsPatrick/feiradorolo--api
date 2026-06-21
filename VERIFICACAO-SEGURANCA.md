# Feira do Rolo — Plano de Verificação & Segurança

> Documento de alinhamento (cliente **Raphael** × agência **Patrick**). Define **o que**,
> **quando** e **com que método/custo** a plataforma verifica usuários.
> Última atualização: **21/06/2026**.

## 🎯 Filosofia
- **Cadastro rápido** (mínimo de fricção) → verificação **na ação que tem custo** (comprar/vender).
- **Verifica 1x por pessoa** — o custo é por **novo usuário** que chega no gatilho, não por transação. Depois é "lucro".
- **Segurança é prioridade** (desmistificar o estigma de "rolo"/OLX), mesmo que custe — mas **gastando só onde importa**.
- **Avisos/notificações sempre por dentro do app (grátis)**; e-mail/WhatsApp só para **verificação** (1x), nunca para notificação recorrente.

## ✅ Spec final (TRAVADO)

| # | Momento | O que verifica | Método | Custo |
|---|---|---|---|---|
| 1 | **Cadastro** | CPF válido + dono do e-mail | **CPF matemático** (obrigatório, valida formato+dígitos+duplicado) **+ e-mail** (código/link) | **grátis** |
| 2 | **Pagar uma compra** OU **antes de gerar a etiqueta** (venda) | dono do telefone | **WhatsApp** (código) via **Z-API** | ~R$100/mês |
| 3 | **Compra OU venda > R$200** (em 1 único pedido/produto) | CPF existe e é da pessoa | **CPF real** (Receita/Serpro) — só se ainda não verificado | ~US$0,50/consulta |
| 4 | **Reconhecimento facial** | rosto = documento | **só no aplicativo** (fase futura) | ~US$3/validação |
| ❌ | SMS | — | **descartado** (WhatsApp valida o mesmo fator, mais barato) | — |

### Regras de detalhe
- **CPF matemático**: pedido **logo no cadastro** (parte 1), obrigatório e validado na hora (grátis, fácil de preencher).
- **CPF real (pago)**: 2ª verificação, disparada **só quando** o comprador paga **ou** o vendedor vende **acima de R$200 em 1 pedido**, e **apenas se** o usuário ainda não tiver CPF verificado.
- **WhatsApp**: na 1ª compra (no pagamento) e/ou 1ª venda (antes da etiqueta).
- **Facial**: adiada para o app.

## 💰 Tabela de custos (estimativas de mercado BR)

| Método | Custo/verificação | ~1.000/mês | ~10.000/mês | Quando |
|---|---|---|---|---|
| CPF matemático + duplicado | **R$ 0** | R$ 0 | R$ 0 | agora |
| E-mail (código/link) | ~R$ 0 (cota grátis) | R$ 0 | ~R$ 0–80 | agora |
| ~~SMS~~ (descartado) | ~US$0,10 | ~US$100 | — | — |
| WhatsApp (Z-API) | ~R$0,05–0,15 + assinatura | ~R$100/mês | ~R$100–600/mês | depois |
| CPF real (Receita/Serpro) | ~US$0,50 | ~US$300–500 | ~US$3k+ | só > R$200 |
| Facial (liveness) | ~US$3,00 | ~US$500–3.000 | ~US$5k–30k | no app |

> **Economia real:** como o CPF real/facial só rodam no gatilho crítico e 1x por pessoa,
> o custo efetivo é uma **fração** (ex.: só a parcela de usuários que vende ou gasta > R$200).

## 🔌 Provedores escolhidos
- **E-mail:** **Resend** (1.000 disparos/mês grátis) — *alternativa já integrada:* **Brevo** (300/dia grátis ≈ 9k/mês).
- **WhatsApp:** **Z-API** (assinatura mensal; instância + token configurados no painel).
- **CPF real:** Receita/**Serpro** (ou BigDataCorp) — a definir o provedor + key.
- **Facial:** a definir (fase app).

## 🗺️ Estado no sistema (o que já existe × novo)

| Peça | Status |
|---|---|
| CPF obrigatório + validação matemática no cadastro (`validators.isCPF/isCNPJ`, `auth.service`) | ✅ **pronto** |
| Gates de "trava na ação" (comprador retido no pagamento; vendedor travado antes da etiqueta) | ✅ **existem** (hoje apontam para facial) |
| Status machine (`email_verified_at`, `phone_verified_at`, `buyer/seller_verification_status`, `has_first_*`) | ✅ existe |
| Provedor de e-mail transacional (`providers/email`) | ✅ integrado |
| ReceitaWS (consulta **CNPJ**) | ✅ integrado (CNPJ é público; **CPF não tem API grátis**) |
| **Verificação por e-mail** (gerar código → enviar → confirmar) | 🔨 **a construir** |
| **WhatsApp via Z-API** | 🔨 a construir + credenciais |
| **CPF real** (Receita/Serpro) + gatilho R$200 (admin) | 🔨 a construir + provedor |
| Trocar método do gate **facial → e-mail/WhatsApp** (facial p/ app) | 🔨 ajuste |

## 🚧 Plano de implementação (ordem)
1. **Agora (sem depender de nada):** verificação por **e-mail** ponta a ponta + exigir e-mail confirmado nos gates + CPF matemático (já roda). Facial sai do gate (vai p/ app).
2. **Quando chegar a key:** ligar **Resend** (ou manter Brevo).
3. **Quando assinar a Z-API:** ligar verificação por **WhatsApp** (config no painel).
4. **Quando definir provedor de CPF:** ligar **CPF real** com gatilho **> R$200** (config no painel).
5. **Fase app:** **facial**.

## ❓ Pendências para destravar
- [ ] Key da **Resend** (ou confirmar uso da **Brevo** já integrada).
- [ ] Assinatura **Z-API** (instância + token).
- [ ] Provedor de **CPF real** + key (Serpro/BigDataCorp…).

## 📌 Nota sobre a "análise" antiga
A análise inicial que circulou (cita `server/services/verification.ts`, `/checkout`, `/upgrade-conta`)
refere-se ao **código ANTIGO** (front antigo em TypeScript). **Não vale** para o sistema novo
(`feiradorolo--api` em JS + `feiradorolo--frontend` em Next.js), onde CPF já é obrigatório/validado,
ReceitaWS é real e os gates de verificação já existem.
