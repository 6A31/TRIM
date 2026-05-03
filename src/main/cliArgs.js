/**
 * Parse TRIM launch flags from an argv array (process.argv or second-instance commandLine).
 */
function parseLaunchArgv(argv) {
  let a = argv;
  if (a === undefined || a === null) a = process.argv;
  if (typeof a === 'string') {
    a = a.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    a = a.map((t) => t.replace(/^"|"$/g, ''));
  }
  if (!Array.isArray(a)) a = process.argv;
  return {
    hidden: a.includes('--hidden'),
    show: a.includes('--show'),
    toggle: a.includes('--toggle'),
  };
}

/** First-instance ready-to-show: should the window be shown? */
function shouldShowOnFirstReady(cli) {
  if (cli.show) return true;
  if (cli.toggle) return true;
  if (cli.hidden) return false;
  return true;
}

/** second-instance: how to react */
function secondInstanceAction(cli) {
  if (cli.toggle) return 'toggle';
  if (cli.show) return 'show';
  return 'show';
}

module.exports = { parseLaunchArgv, shouldShowOnFirstReady, secondInstanceAction };
