"use strict";
// DBX embeds the UI with sandbox="allow-scripts", without allow-forms.
// Perform application actions directly; never rely on native form submission.
window.KingbaseForms = Object.freeze({
  bind(formId, buttonId, callback) {
    const form = document.getElementById(formId), button = document.getElementById(buttonId);
    const activate = event => {
      event.preventDefault();
      if (!button.disabled) void callback(event);
    };
    button.addEventListener("click", activate);
    // Keep programmatically dispatched submit events compatible, while always
    // cancelling navigation. Real sandbox clicks use the handler above.
    form.addEventListener("submit", activate);
    form.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const input = event.target;
      if (!input.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"])') || input.disabled || input.isContentEditable) return;
      activate(event);
    });
  }
});
