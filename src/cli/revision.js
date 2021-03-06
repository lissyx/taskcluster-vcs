import { ArgumentParser } from 'argparse';
import detectLocal from '../vcs/detect_local';

export default async function main(config, argv) {
  let parser = new ArgumentParser({
    prog: 'tc-vcs revision',
    version: require('../../package').version,
    addHelp: true,
    description: 'get current revision'
  });

  let args = parser.parseKnownArgs(argv);
  let path = args[1][0] || process.cwd();
  let vcsConfig = await detectLocal(path);
  let vcs = require('../vcs/' + vcsConfig.type);
  process.stdout.write(await vcs.revision(config, path));
}

