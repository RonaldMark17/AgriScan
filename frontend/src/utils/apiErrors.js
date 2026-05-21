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

export function buildDetailedAlert(title, reason, action) {
  return [
    cleanAlertSentence(title),
    reason ? `Reason: ${cleanAlertSentence(reason)}` : '',
    action ? `What to do: ${cleanAlertSentence(action)}` : '',
  ].filter(Boolean).join('\n');
}

export function getDetailedApiErrorMessage(error, fallback = 'Something went wrong.', options = {}) {
  const status = error?.response?.status;
  const reason = getApiErrorMessage(error, fallback);
  const title = options.title || defaultAlertTitle(status);
  const action = options.action || defaultAlertAction(status, reason);
  return buildDetailedAlert(title, reason, action);
}

function formatValidationIssue(issue) {
  if (!issue || typeof issue !== 'object') {
    return String(issue || '');
  }

  const field = Array.isArray(issue.loc) ? issue.loc.filter((part) => part !== 'body').join('.') : '';
  const message = issue.msg || issue.message || 'Invalid value';
  return field ? `${field}: ${message}.` : `${message}.`;
}

function cleanAlertSentence(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function defaultAlertTitle(status) {
  if (status == null) return 'Network request failed.';
  if (status === 400) return 'Request could not be completed.';
  if (status === 401) return 'Authentication is required.';
  if (status === 403) return 'Your account is not allowed to do this.';
  if (status === 404) return 'The requested record was not found.';
  if (status === 409) return 'This record conflicts with existing data.';
  if (status === 413) return 'Upload was blocked.';
  if (status === 422) return 'Some required details are invalid.';
  if (status >= 500) return 'Server could not complete the request.';
  return 'Action failed.';
}

function defaultAlertAction(status, reason = '') {
  const normalizedReason = reason.toLowerCase();
  if (status == null) return 'Check your connection, make sure the server is reachable, then try again.';
  if (status === 401) return 'Sign in again, then retry the action.';
  if (status === 403 && normalizedReason.includes('farm') && normalizedReason.includes('register')) {
    return 'Open Farms, register your farm details, save the farm record, then retry the feature.';
  }
  if (status === 403 && normalizedReason.includes('mfa')) {
    return 'Complete MFA verification, then retry the action.';
  }
  if (status === 403) return 'Use an account with the correct role or ask an administrator to update your permissions.';
  if (status === 404) return 'Refresh the page and make sure the record still exists before trying again.';
  if (status === 409) return 'Review the existing record and use unique details before trying again.';
  if (status === 413) return 'Choose a smaller file or compress it before uploading again.';
  if (status === 422 || status === 400) return 'Review the fields shown on the form, correct the invalid value, then submit again.';
  if (status >= 500) return 'Try again in a moment. If it keeps failing, contact support with the exact error.';
  return 'Check the details and try again.';
}
