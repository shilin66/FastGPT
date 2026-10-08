export const sandboxEditorDisconnectEvent = 'sandbox-editor-before-disconnect';

export const requestSandboxEditorDisconnect = () =>
  typeof window === 'undefined' ||
  window.dispatchEvent(new Event(sandboxEditorDisconnectEvent, { cancelable: true }));
