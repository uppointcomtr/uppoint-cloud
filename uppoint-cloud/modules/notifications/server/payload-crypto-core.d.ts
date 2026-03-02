export const PAYLOAD_PREFIX: string;
export function sealNotificationPayloadWithSecret(plainText: string, secret: string): string;
export function openNotificationPayloadWithSecret(storedValue: string, secret: string): string;
