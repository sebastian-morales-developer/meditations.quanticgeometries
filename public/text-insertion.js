(function exposeTextInsertion(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TextInsertion = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createTextInsertion() {
  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(Number.isFinite(value) ? value : maximum, minimum), maximum);
  }

  function insertTextAtRange(value, text, start, end, maxLength = Infinity) {
    const currentValue = String(value ?? '');
    const normalizedText = String(text ?? '').trim();
    const rangeStart = clamp(start, 0, currentValue.length);
    const rangeEnd = clamp(end, rangeStart, currentValue.length);
    const left = currentValue.slice(0, rangeStart);
    const right = currentValue.slice(rangeEnd);
    const leadingSpace = left && !/\s$/.test(left) && !/^[,.;:!?)]/.test(normalizedText) ? ' ' : '';
    const trailingSpace = right && !/^\s/.test(right) && !/[([{]$/.test(normalizedText) ? ' ' : '';
    const requestedInsertion = `${leadingSpace}${normalizedText}${trailingSpace}`;
    const availableLength = Math.max(0, maxLength - left.length - right.length);
    const insertion = requestedInsertion.slice(0, availableLength);

    return {
      value: `${left}${insertion}${right}`,
      cursor: left.length + insertion.length,
      truncated: insertion.length < requestedInsertion.length
    };
  }

  return { insertTextAtRange };
}));
