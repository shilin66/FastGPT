import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

// Patch JSONC by token offsets so unrelated settings and comments remain byte-for-byte intact.
export const sandboxEditorDefaultsScript = String.raw`import os, sys, stat, json, re, fcntl, time, secrets
directory = sys.argv[1]
marker = '.omni-editor-layout-v2'
defaults = {
    'workbench.startupEditor': ('terminal', 'none'),
    'window.menuBarVisibility': ('hidden', 'visible'),
}
legacy = {
    'workbench.welcomePage.tasks.showOnStart': False,
    'editor.minimap.enabled': False,
    'workbench.tips.enabled': False,
    'editor.accessibilitySupport': 'off',
    'editor.hover.enabled': 'off',
    'editor.hover.sticky': False,
    'editor.acceptSuggestionOnCommitCharacter': False,
    'editor.acceptSuggestionOnEnter': 'off',
    'editor.inlineSuggest.edits.allowCodeShifting': 'never',
    'editor.inlineSuggest.edits.renderSideBySide': 'never',
    'editor.inlineSuggest.edits.showLongDistanceHint': False,
    'editor.inlineSuggest.enabled': False,
    'editor.inlineSuggest.experimental.emptyResponseInformation': False,
    'editor.inlineSuggest.showToolbar': 'never',
    'editor.inlineSuggest.suppressInSnippetMode': False,
    'workbench.commandPalette.showAskInChat': False,
    'workbench.commandPalette.experimental.enableNaturalLanguageSearch': False,
    'workbench.tree.enableStickyScroll': False,
    'chat.disableAIFeatures': True,
    'workbench.activityBar.location': 'hidden',
    'workbench.statusBar.visible': False,
    'workbench.editor.showTabs': 'none',
    'window.commandCenter': False,
    'workbench.editor.editorActionsLocation': 'hidden',
    'workbench.layoutControl.enabled': False,
}
maximum = 262144
def signature(info): return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
def current(folder):
    try: return os.stat('settings.json', dir_fd=folder, follow_symlinks=False)
    except FileNotFoundError: return None
def unchanged(folder, before):
    after = current(folder)
    return (before is None and after is None) or (before is not None and after is not None and signature(before) == signature(after))
def atomic_write(folder, name, content, before=None):
    temporary = '.omni-editor-' + secrets.token_hex(12) + '.tmp'
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=folder)
        with os.fdopen(fd, 'wb') as output:
            if before is not None:
                os.fchown(output.fileno(), before.st_uid, before.st_gid)
                os.fchmod(output.fileno(), stat.S_IMODE(before.st_mode))
            output.write(content.encode('utf-8'))
            output.flush()
            os.fsync(output.fileno())
        if name == 'settings.json' and not unchanged(folder, before): raise ValueError('settings changed')
        os.replace(temporary, name, src_dir_fd=folder, dst_dir_fd=folder)
        os.fsync(folder)
    finally:
        try: os.unlink(temporary, dir_fd=folder)
        except FileNotFoundError: pass
def reject_constant(value): raise ValueError('invalid JSON constant')
def patch(source):
    clean = list(source)
    if source.startswith('\ufeff'): clean[0] = ' '
    pattern = r'"(?:[^"\\]|\\.)*"|//[^\r\n]*|/\*[\s\S]*?\*/|\s+|[{}\[\]:,]|[^"\s{}\[\]:,/\ufeff]+'
    tokens, end = [], 1 if source.startswith('\ufeff') else 0
    for match in re.finditer(pattern, source[end:]):
        start, stop = match.start() + (1 if source.startswith('\ufeff') else 0), match.end() + (1 if source.startswith('\ufeff') else 0)
        if start != end: raise ValueError('invalid JSONC token')
        value = match.group()
        if value.startswith('//') or value.startswith('/*'):
            clean[start:stop] = ['\n' if char == '\n' else ' ' for char in value]
        elif not value.isspace(): tokens.append((value, start, stop))
        end = stop
    if end != len(source): raise ValueError('incomplete JSONC')
    for index, token in enumerate(tokens[:-1]):
        if token[0] == ',' and tokens[index + 1][0] in ('}', ']'): clean[token[1]] = ' '
    settings = json.loads(''.join(clean), parse_constant=reject_constant)
    if not isinstance(settings, dict): raise ValueError('settings must be an object')
    depth, locations = 0, {}
    for index, (value, start, stop) in enumerate(tokens):
        if value in ('{', '['): depth += 1
        elif value in ('}', ']'): depth -= 1
        elif depth == 1 and value.startswith('"') and index + 1 < len(tokens) and tokens[index + 1][0] == ':':
            name = json.loads(value)
            if name in defaults or name in legacy:
                if name in locations: raise ValueError('duplicate workbench preference')
                locations[name] = index
    changes, removed, missing = [], set(), []
    for name, (old, desired) in defaults.items():
        if name not in settings:
            missing.append(json.dumps(name) + ': ' + json.dumps(desired))
        elif settings[name] == old:
            _, start, stop = tokens[locations[name] + 2]
            changes.append((start, stop, json.dumps(desired)))
    for name, old in legacy.items():
        if name in settings and type(settings[name]) is type(old) and settings[name] == old:
            index = locations[name]
            for _, start, stop in tokens[index:index + 3]: changes.append((start, stop, ''))
            if tokens[index + 3][0] == ',':
                _, start, stop = tokens[index + 3]
                changes.append((start, stop, ''))
            removed.add(name)
    if missing:
        insertion = '\n    ' + ',\n    '.join(missing) + (',' if len(settings) > len(removed) else '') + '\n'
        changes.append((tokens[0][2], tokens[0][2], insertion))
    for start, stop, value in sorted(changes, reverse=True): source = source[:start] + value + source[stop:]
    return source
def migrate():
    os.makedirs(directory, exist_ok=True)
    folder = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        fd = os.open('.omni-editor-startup-v1.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=folder)
        with os.fdopen(fd, 'r+') as lock:
            if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode): raise ValueError('invalid lock')
            deadline = time.monotonic() + 2
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline: raise ValueError('lock timeout')
                    time.sleep(0.05)
            try:
                info = os.stat(marker, dir_fd=folder, follow_symlinks=False)
                if not stat.S_ISREG(info.st_mode): raise ValueError('invalid marker')
                return
            except FileNotFoundError: pass
            before = current(folder)
            source = '{}'
            if before is not None:
                fd = os.open('settings.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=folder)
                with os.fdopen(fd, 'rb') as handle:
                    info = os.fstat(handle.fileno())
                    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > maximum or signature(before) != signature(info):
                        raise ValueError('invalid settings file')
                    content = handle.read(maximum + 1)
                    if len(content) > maximum or signature(before) != signature(os.fstat(handle.fileno())):
                        raise ValueError('settings changed')
                    source = content.decode('utf-8')
            updated = patch(source)
            if updated != source: atomic_write(folder, 'settings.json', updated, before)
            elif not unchanged(folder, before): raise ValueError('settings changed')
            atomic_write(folder, '.omni-editor-startup-v1', '1\n')
            atomic_write(folder, marker, '1\n')
    finally: os.close(folder)
try:
    migrate()
    print('editor-settings-ready')
except (OSError, ValueError, UnicodeError, RecursionError):
    print('editor-settings-skipped')
`;

export const ensureSandboxEditorDefaults = async (provider: Pick<ISandbox, 'execute'>) => {
  try {
    const result = await provider.execute(
      `python3 - /home/sandbox/.local/share/code-server/User <<'PY'\n${sandboxEditorDefaultsScript}\nPY`,
      { timeoutMs: 5_000, maxOutputBytes: 1024 }
    );
    if (result.exitCode === 0 && result.stdout.trim() === 'editor-settings-ready') return true;
  } catch {
    // Defaults are optional; a broken user settings file must not prevent IDE access.
  }
  logger.warn('Sandbox editor workbench settings migration skipped');
  return false;
};
