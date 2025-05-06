#!/usr/bin/env node

const child_process = require('child_process');

const inspect = process.argv.indexOf('--inspect-brk') !== -1;

// console.log({cwd: process.cwd()});

const glob = require('glob-promise');
// const {Katch} = require("./katch");

;(async function() {

   let paths = await glob('**/*.{class,test}.ts')
   paths = paths.filter(_=>!_.match(/node_modules/));
   // console.log(paths);
   let name2path = {}, name2type = {};
   for(let path of paths) {
      let [, name, type] = path.match(/([^/]+)[.](class|test)[.](ts|js)$/)
      name2path[name] = path;
      name2type[name] = type;
   }
   let eval = 'process.argv = ' + JSON.stringify(process.argv) + ';';
   for(let runArg of process.argv.filter(_=>(_.match(/^--run=/)))) {
      let [className, method] = runArg.match(/[^=]+$/)[0].split('.')
      eval += `;import {${className}} from './${name2path[className]}'; ${className}.${method}(${name2type[className] === 'test'? '{TestResult: {}}': ''});`
   }
   for(let runArg of process.argv.filter(_=>(_.match(/^--init-context=/)))) {
      eval += `;import {KatchContext} from "katch-js-lib/katch"`
      let [className, method] = runArg.match(/[^=]+$/)[0].split('.')
      eval += `;import {${className}} from './${name2path[className]}'; KatchContext.initFromCommandLine(${JSON.stringify([className])});`
   }
   for(let runArg of process.argv.filter(_=>(_.match(/^--test/)))) {
      eval += `;import {KatchContext} from "katch-js-lib/katch"`
      let [className, method] = runArg.match(/[^=]+$/)[0].split('.')
      eval += `;KatchContext.initFromCommandLine();`
   }
   eval = 'import { register } from "node:module"; import { pathToFileURL } from "node:url"; register("ts-node/esm", pathToFileURL("./"));' + eval;

   child_process.spawn('/usr/bin/env', ['bash', '-c', JSON.stringify(`
      node --trace-exit --trace-warnings --no-opt ${inspect ? '--inspect ' : ''} node_modules/.bin/ts-node-transpile-only -O '${JSON.stringify({
      "target": "ES2022",
   })}' -r tsconfig-paths/register -e ${JSON.stringify(eval)}
   `.trim())], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
   })

})();

