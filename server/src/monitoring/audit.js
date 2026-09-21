// Never copy request bodies, cookies or headers into audit metadata.
const sensitiveKey = /password|secret|token|authorization|cookie|credential|hash/i;
export function redactText(value) {
  return value.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\b(?:Bearer\s+)[^\s,;]+/gi, '[REDACTED]')
    .replace(/\b(?:password|jwt_secret|secret|token)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[REDACTED]')
    .replace(/\b[a-f0-9]{64}\b/gi, '[REDACTED]')
    .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED]');
}
export function safeEvidence(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(safeEvidence);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitiveKey.test(key)).map(([key, item]) => [key, safeEvidence(item)]));
  return value;
}
export function writeAudit(tx, { actorId, action, entityType, entityId, metadata }) {
  return tx.auditLog.create({ data: { userId: actorId, action, entityType, entityId, ...(metadata ? { metadata: safeEvidence(metadata) } : {}) } });
}
export const actorSelect = { id: true, fullName: true, role: true };
export const auditSelect = { id: true, action: true, entityType: true, entityId: true, createdAt: true, metadata: true, user: { select: actorSelect } };
export const auditDto = row => ({ ...row, metadata: safeEvidence(row.metadata) });
