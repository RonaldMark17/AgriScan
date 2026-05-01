export function getApiErrorMessage(error, fallback = 'Something went wrong.') {
  if (error?.response?.status === 413) {
    return fallback && fallback !== 'Something went wrong.' ? fallback : 'Uploaded file is too large.';
  }

  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail.map(formatValidationIssue).join(' ');
  }

  if (detail && typeof detail === 'object') {
    return formatValidationIssue(detail);
  }

  if (typeof error?.message === 'string') {
    return error.message;
  }

  return fallback;
}

function formatValidationIssue(issue) {
  if (!issue || typeof issue !== 'object') {
    return String(issue || '');
  }

  const field = Array.isArray(issue.loc) ? issue.loc.filter((part) => part !== 'body').join('.') : '';
  const message = issue.msg || issue.message || 'Invalid value';
  return field ? `${field}: ${message}.` : `${message}.`;
}
