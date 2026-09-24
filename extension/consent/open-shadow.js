// Page world, document_start, only on sites whose consent dialog lives in a *closed* shadow root
// (Seznam's dialog on mapy/kupi). Makes that one dialog's root open so the rule can reach its
// buttons; every other attachShadow call is untouched.
const attach = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init) {
  if (init?.mode === 'closed' && this.classList?.contains('szn-cmp-dialog-container')) {
    return attach.call(this, { ...init, mode: 'open' });
  }
  return attach.call(this, init);
};
