import { GOVTALK_NAMESPACE, buildR68Envelope, xeText } from './r68Builder.ts';
import type { R68Charity, R68LineItem } from './r68Builder.ts';

export interface GatewayAuth { senderId: string; password: string; }

export interface GovTalkOptions {
  charity: R68Charity;
  items: R68LineItem[];
  periodEnd: string;
  test: boolean;               // GatewayTest: true => "1", false => "0" (Live)
  vendorId: string;            // "9515"
  productName: string;         // "ReKindle BC"
  productVersion: string;      // "1.0"
  auth?: GatewayAuth;          // required for ETS/Live; omit for LTS body test
  correlationId?: string;
  gatewayTimestamp?: string;   // TEST ONLY — Live is stamped by the gateway
}

export async function buildGovTalkMessage(
  opts: GovTalkOptions,
): Promise<{ xml: string; irmark: string }> {
  const { xml: irenvelope, irmark } = await buildR68Envelope(opts.charity, opts.items, opts.periodEnd);
  const senderDetails = opts.auth
    ? `<SenderDetails><IDAuthentication>` +
        `<SenderID>${xeText(opts.auth.senderId)}</SenderID>` +
        `<Authentication><Method>clear</Method><Role>principal</Role>` +
        `<Value>${xeText(opts.auth.password)}</Value></Authentication>` +
      `</IDAuthentication></SenderDetails>`
    : `<SenderDetails/>`;
  // CorrelationID is always emitted (empty on first submit) and TargetDetails is
  // required — both are present in HMRC's valid sample and their absence makes the
  // Transaction Engine/LTS fail to resolve the ServiceMessageType (error 8998).
  const correlation = `<CorrelationID>${opts.correlationId ? xeText(opts.correlationId) : ''}</CorrelationID>`;
  const gwTimestamp = opts.gatewayTimestamp ? `<GatewayTimestamp>${xeText(opts.gatewayTimestamp)}</GatewayTimestamp>` : '';
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<GovTalkMessage xmlns="${GOVTALK_NAMESPACE}">` +
      `<EnvelopeVersion>2.0</EnvelopeVersion>` +
      `<Header><MessageDetails>` +
        `<Class>HMRC-CHAR-CLM</Class><Qualifier>request</Qualifier><Function>submit</Function>` +
        correlation + `<Transformation>XML</Transformation>` +
        `<GatewayTest>${opts.test ? '1' : '0'}</GatewayTest>` + gwTimestamp +
      `</MessageDetails>` + senderDetails + `</Header>` +
      `<GovTalkDetails>` +
        `<Keys><Key Type="CHARID">${xeText(opts.charity.hmrcRef)}</Key></Keys>` +
        `<TargetDetails><Organisation>HMRC</Organisation></TargetDetails>` +
        `<ChannelRouting><Channel>` +
          `<URI>${xeText(opts.vendorId)}</URI><Product>${xeText(opts.productName)}</Product>` +
          `<Version>${xeText(opts.productVersion)}</Version>` +
        `</Channel></ChannelRouting>` +
      `</GovTalkDetails>` +
      `<Body>${irenvelope}</Body>` +
    `</GovTalkMessage>`;
  return { xml, irmark };
}
