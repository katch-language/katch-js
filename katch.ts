try {
   if(process.APM_SERVER_URL) {
      require('elastic-apm-node').start({
         serverUrl: process.APM_SERVER_URL,
         secretToken: process.APM_SECRET,
         serviceName: 'A', // https://www.elastic.co/guide/en/apm/agent/nodejs/current/configuration.html#service-name
         environment: 'B', // https://www.elastic.co/guide/en/apm/agent/nodejs/current/configuration.html#environment
      });
   }
} catch(e) {
   console.log(e);
}

import * as fs from 'fs';
import {Debugger} from "node:inspector";
import readline from "readline";
import * as child_process from "node:child_process";
const glob = require('glob-promise');
import {addStatsD} from "./sendStats.fn.js";


import { Worker } from 'worker_threads';
import ts from 'typescript';

// Универсальная функция для запуска inline TypeScript воркера
export function runInlineTsWorker(tsCode: string, workerData: any) {
   // Транспиляция TypeScript-кода в JavaScript

   // const jsWorkerCode = ts.transpileModule(tsCode, {
   //    compilerOptions: {
   //       module: ts.ModuleKind.CommonJS,
   //       target: ts.ScriptTarget.ES2020,
   //    },
   // }).outputText;

   const worker = new Worker(tsCode, {
      eval: true,
      workerData
   });

   return worker;

}

function getAllProperties(obj) {
   let props = new Set();

   while (obj) {
      Object.getOwnPropertyNames(obj).forEach(prop => props.add(prop));
      obj = Object.getPrototypeOf(obj);
   }

   return [...props];
}

function LogClass(target: Function) {
   // Логируем все методы класса (включая статические)
   Object.getOwnPropertyNames(target.prototype).forEach((methodName) => {
      if (methodName === 'constructor') {
         return; // Пропускаем конструктор
      }

      const originalMethod = target.prototype[methodName];

      target.prototype[methodName] = function (...args: any[]) {
         const className = target.name;

         // Получаем стек вызовов для определения строки
         const stack = new Error().stack?.split('\n')[2]; // 2-я строка будет содержать вызов метода
         const lineInfo = stack?.match(/:(\d+):\d+/); // Ищем номер строки в стеке
         const lineNumber = lineInfo ? lineInfo[1] : 'unknown';

         console.log(`\n                [${className}].${methodName}:${lineNumber}\n                ====================`);

         return originalMethod.apply(this, args);
      };
   });

   // Логируем все статические методы
   Object.getOwnPropertyNames(target).forEach((methodName) => {
      if (methodName === 'length' || methodName === 'prototype' || methodName === 'name') {
         return; // Пропускаем специальные свойства класса
      }

      const originalMethod = target[methodName];

      if (typeof originalMethod === 'function') {
         target[methodName] = function (...args: any[]) {
            const className = target.name;

            // Получаем стек вызовов для определения строки
            const stack = new Error().stack?.split('\n')[2]; // 2-я строка будет содержать вызов метода
            const lineInfo = stack?.match(/:(\d+):\d+/); // Ищем номер строки в стеке
            const lineNumber = lineInfo ? lineInfo[1] : 'unknown';

            console.log(`\n                ${className}.${methodName}:${lineNumber}\n                ===================`);

            return originalMethod.apply(this, args);
         };
      }
   });
}


let katchMode = 1;
let lastEvent = null;



let name2collected_method = {}

let collected_tests = [];
let class2collected_tests = {};
let class2decorated_methods = {};
let class2decorated_static_methods = {};

// @LogClass
export class KatchContext {

   classes                 = {}
   objects                 = {}
   listeners_event         = []
   listeners_request       = []
   listeners_requestevent  = []


   ModuleToInit;

   // @todo
   static async initFromCommandLine(init_contexts = undefined) {

      init_contexts = init_contexts ||
         (process.argv.
         map(_=>(
            _.match(/^--init-context=(.*)/) || [])
            [1]
         )
            .filter(_=>_)
            [0] || '')
            .split(',').filter(_=>_);

      let run_tests = false;

      if(process.argv.filter(_=>_ === '--test').length) {
         run_tests = true
      }

      let inspector = false;
      if(process.argv.filter(_=>_ === '--inspect').length) {
         inspector = true
      }
      if(process.argv.filter(_=>_ === '--inspect-brk').length) {
         inspector = true
      }

      if(inspector) {

         function isPortAvailable(port, host = '127.0.0.1') {
            return new Promise((resolve, reject) => {
               const server = net.createServer();
               server.unref();
               server.on('error', () => reject(false));
               server.listen(port, host, () => {
                  server.close(() => resolve(true));
               });
            });
         }

         for(let port = 9229; ;port++) {
            try {
               // check if port is available
               await isPortAvailable(port) && require('inspector').open(port, process.env.INSPECTOR_HOST || '127.0.0.1');
               break;
            } catch (e) {
               Katch.debug = e
            }
         }
      }

      await new Promise(_ => setTimeout(_, process.execArgv.indexOf('--inspect') === -1 ? 0 : 1000));

      await this.scanFilesInDirectory();

      if(run_tests) {
         await this.runTests();
      }

      if(init_contexts.length) {
         contexts.App = new KatchContext();
         await contexts.App.initAllContexts(init_contexts)
         await contexts.App.initAllObjects();
         await contexts.App.scanMethodsAndSubscribe();
         await contexts.App.triggerInitRequestToRunApp();
         // await contexts.App.listenCtrlRAndRunDebugMethod();
      }

   }

   listenCtrlRAndRunDebugMethod() {
      const readline = require('readline');

      const rl = readline.createInterface({
         input: process.stdin,
         output: process.stdout
      });

      // Set raw mode to true to capture key presses
      rl.input.setRawMode(true);
      rl.input.resume();
      rl.input.setEncoding('utf8');

      rl.input.on('data', async (key) => {
         // Check for Ctrl+R (key code for Ctrl+R is '\u0012')
         if (key === '\u0012') {

            for(let classname in this.objects) {

               if(!this.objects[classname].debug) {
                  continue;
               }

               let __filename = this.classes[classname].__filename;

               console.log(`Ctrl+R and .debug() detected! Executing code in ${classname}...`);

               let tmpName = Math.random().toString(32).substring(2);

               let fs = require('fs');

               let module;
               try {
                  fs.writeFileSync('./.' + tmpName + '.ts', fs.readFileSync(__filename));
                  child_process.execSync(`tsc --noEmitOnError false .${tmpName}.ts`);
                  module = await import('./.' + tmpName);
               } catch (e) {
                  console.error(e);
               }

               try {
                  fs.rmSync('./.' + tmpName + '.ts');
               } catch (e) {
                  console.error(e);
               }
               try {
                  fs.rmSync('./.' + tmpName + '.js');
               } catch (e) {
                  console.error(e);
               }


               try {
                  this.debug = Object.values(module.default)[0].prototype.debug;
                  await this.debug();
               } catch (e) {
                  console.error(e);
               }
            }
         }

         // Exit on Ctrl+C
         if (key === '\u0003') {
            process.exit();
         }
      });

   }

   static async scanFilesInDirectory() {

      Katch.classes[KatchApp.name] = KatchApp;

      let files = await glob(process.cwd() + "/**/*.ts", {ignore: '**/node_modules/**'});
      files = files.filter(file => fs.readFileSync(file).toString().match(/@Katch/));

      for(let file of files) {

         let module_members = await import(file);

         for(let classname in collected_classes) {
            if(module_members[classname] === collected_classes[classname] || module_members.default[classname] === collected_classes[classname]) {
               Katch.classes[classname] = collected_classes[classname];
               delete collected_classes[classname];
            }
         }
      }

      if(Object.keys(collected_classes).length !== 0) {
         Katch.debug = 'warning: classes were collected by @Katch but not exported: ' + Object.keys(collected_classes).join(', ');
         for(let classname in collected_classes) {
            Katch.classes[classname] = collected_classes[classname];
            delete collected_classes[classname];
         }
      }



      for(let classname in Katch.classes) {
         let current_class = Katch.classes[classname];

         getAllProperties(current_class).map(it => {

            if(it.startsWith('Event_') || it.startsWith('Consumer_Event_') || it.startsWith('Request_') || it.startsWith('Consumer_Request_') ) {
               let _point_args = (current_class[it]._point_args || [])[0] || current_class[it]();

               current_class[it] = {[current_class.name + '.' + it]: function(..._trigger_args) {
                     let o = this;

                     if(o === current_class || !o) {
                        o = Object.create(current_class[it].prototype)
                     }
                     Object.defineProperties(o, {
                        _trigger_args  : {value: _trigger_args       , enumerable: false},
                        _point_args    : {value: _point_args         , enumerable: false},
                        _trigger_name  : {value: it                  , enumerable: false},
                        _class_name    : {value: current_class.name  , enumerable: false},
                     })
                     Object.assign(o, _trigger_args[0] || {})

                     return o;
                  }}[current_class.name + '.' + it];

               Object.defineProperties(current_class[it], {
                  _point_args    : {value: _point_args         , enumerable: false},
                  _trigger_name  : {value: it                  , enumerable: false},
                  _class_name    : {value: current_class.name  , enumerable: false},
               })

            }

         })

      }

   }

   async initAllContexts(init_contexts) {

      for(let name of init_contexts) {
         // console.log('name', name, Katch.classes[name], Katch.classes)
         let _class = Katch.classes[name];
         this.classes[_class.name] = _class;
      }

      // инициализировать все зависимые контексты
      let done = false;
      while (!done) {
         done = true;
         for(let classname in Katch.classes) {
            // Katch.debug = classname;
            for(let initWithClass of Katch.classes[classname].initWith || []) {
               try {
                  if(this.classes[initWithClass.name] && !this.classes[classname]) {
                     this.classes[classname] = Katch.classes[classname];
                     done = false;
                  }
               } catch (e) {
                  Katch.debug = {classname, initWithClass, this_classes: this.classes}
                  throw e
               }
            }
         }

         for(let _classname in this.classes) {
            let _class = this.classes[_classname];
            let context_classes = Katch.classes[_class.name].context || [];
            for(let _context_class of context_classes) {
               if(!this.classes[_context_class.name]) {
                  this.classes[_context_class.name] = _context_class;
                  done = false;
               }
            }
         }
      }

   }

   static async runTests() {
      // запустить тесты
      for(let classname in Katch.classes) {
         for(let test of class2collected_tests[classname] || []) {

            let ctx = new KatchContext();
            ctx.classes[classname] = Katch.classes[classname];
            await ctx.initAllObjects();
            await ctx.scanMethodsAndSubscribe();

            let instance = Object.values(ctx.objects)[0];
            await instance[test]();

         }
      }
   }

   async initAllObjects() {
      for(let _classname in this.classes) {
         let _class = this.classes[_classname];
         // console.log(_class)
         // Katch.debug = _class;
         let object = new _class();
         Object.defineProperty(object, 'context',  { value: this, enumerable: false});

         this.objects[_classname] = object;
         object2context.set(object, this);
      }
   }

   async scanMethodsAndSubscribe() {

      function generateFakeArgs() {
         let args = [];
         for(let i = 0; i < 10; i++) {
            args.push({_arg_position: i});
         }
         return args;
      }


      katchMode = 1;
      for(let oname in this.objects) {
         let o = this.objects[oname];
         for(let i of class2decorated_methods[o.constructor.name]) {
            let method = o[i];
            parsed_events = [];
            try {
               await o[i](...generateFakeArgs());
               throw new Error('the function must have Katch block at the top');
            } catch(e) {
               if(e !== Katch.break) {
                  throw e
               }
               //
               // Katch.debug = o;
               // Katch.debug = i;

               // @todo здесь нужно распарсить на какие эвенты была подписка и добавить в listeners
               let [katch_type, katch_args] = KatchArgsMode1;
               for(let trigger of katch_args) {

                  if(katch_type === 'event') {
                     // Katch.debug = {oname,i, trigger};
                     if(!trigger._trigger_name.match(/Event_/)) {
                        throw new Error('Trying to Katch.Event on ' + trigger._trigger_name);
                     }
                  }

                  if(katch_type === 'request') {
                     if(!trigger._trigger_name.match(/Request_/)) {
                        throw new Error('Trying to Katch.Request on ' + trigger._trigger_name);
                     }
                  }

                  if(katch_type === 'requestevent') {
                     if(!trigger._trigger_name.match(/Event_/)) {
                        throw new Error('Trying to Katch.RequestEvent on ' + trigger._trigger_name);
                     }
                  }

                  if(trigger instanceof Function) {
                     trigger = trigger();
                  }

                  let arg2path = [];

                  (function scanArgPositions(cursor, path) {
                     if(cursor._arg_position !== undefined) {
                        arg2path[cursor._arg_position] = path;
                     }

                     for(let key in cursor) {
                        if(key === '_arg_position') {
                           continue
                        }
                        if(cursor[key]) {
                           if(cursor[key] instanceof Object) {
                              scanArgPositions(cursor[key], [...path, key]);
                           }
                        }
                     }
                  })(trigger,[]);
                  //
                  // Katch.debug = arg2path;

                  let filter = (function trigger2filter(filter_cursor, trigger_cursor) {
                     for(let key in trigger_cursor) {
                        if(key === '_arg_position') {
                           continue
                        }
                        if(typeof trigger_cursor[key] === 'object') {
                           filter_cursor[key] = trigger2filter({}, trigger_cursor[key]);
                        } else {
                           filter_cursor[key] = trigger_cursor[key];
                        }
                     }
                     return filter_cursor
                  })({}, trigger);


                  // Katch.debug = filter;

                  let listeners = this[`listeners_${katch_type}`]

                  // Katch.debug = filter.type;
                  //
                  // Katch.debug = trigger;

                  if(!listeners[trigger._class_name + '.' + trigger._trigger_name]) {
                     listeners[trigger._class_name + '.' + trigger._trigger_name] = [];
                  }
                  listeners[trigger._class_name + '.' + trigger._trigger_name].push([o,i, filter, arg2path]);
               }

               o[i] = function(...args) {
                  return method.apply(this, args)
               }

               o[i]._method_name = i;
               o[i]._class_name = o.constructor.name;

               continue
            }
            throw new Error('Katch.event or Katch.request is not defined in method' + o.constructor.name + '.' + i);
         }

      }
      katchMode = 2;

      // Katch.debug = this.listeners_event;
      // Katch.debug = this.listeners_request;
      // Katch.debug = this.listeners_requestevent;
   }

   // @todo
   async triggerInitRequestToRunApp() {

      // Katch.debug = this.objects;

      try {
         await Object.values(this.objects)[0].fireRequest(Object.values(this.classes)[0].Request_Init());
      } catch (e) {
         Katch.debug = e;
      }
      await Object.values(this.objects)[0].fireEvent  (Object.values(this.classes)[0].Event_Inited());

      // workaround until we have event definition inheritance
      await Object.values(this.objects)[0].fireEvent  (KatchApp.Event_Inited());

      process.on('uncaughtException', (err) => {
         if(err.stack) {
            let fileNameColRow = err.stack.match(/\/([^:]+):([0-9]+):([0-9]+)/);
            if(!fileNameColRow) {
               console.log(`\x1b[31m${err.stack}\x1b[0m`, err)
            }
            let [, fileName, row, col] = fileNameColRow;
            // console.log({fileName, row, col, err_stack: err.stack})
            eval(`//# sourceURL=/${fileName}\n${ ''.padEnd(Math.floor(row) - 3, '\n').split("\n").map(_=>"((_=>{}))();\n").join("")}${''.padEnd(Math.floor(col) - 6, ' ')}console.log('\x1b[31m' + err.stack + '\x1b[0m');`);
         } else {
            console.log(`\x1b[31m${err}\x1b[0m`, err)
         }
      });

      process.on('unhandledRejection', (reason, promise) => {
         throw reason
      });
   }
}

let methodIsDecorated = new WeakMap();

let KatchArgsMode1 = [];

export const Katch = function(...args) {

   if(args[1]?.kind || args?.[2]?.value) {
      // decorator mode

      if(args?.[2]?.value) {
         throw new Error(`Experimental decorators are not implemented`);
      }

      if(args[1]?.kind === 'class') {
         current_class = args[0];

         let methods = [];
         let static_methods = [];

         let cursor = current_class;
         while(cursor) {
            methods.push(...Object.getOwnPropertyNames(cursor.prototype));
            static_methods.push(...Object.getOwnPropertyNames(cursor));
            cursor = Object.getPrototypeOf(cursor.prototype)?.constructor
         }

         class2decorated_methods[current_class.name] = methods
            .filter(name=> {
               if(name === 'constructor') {
                  return;
               }
               let method = current_class.prototype[name];
               if(method.toString().match('Katch.Event') || method.toString().match('Katch.Request')) {
                  if(method.toString().match('Katch.Request') && !method.toString().match('Katch.requestHandlerReady')) {
                     throw new Error(`method ${current_class.name}.${name} must use await Katch.requestHandlerReady()`);
                  }
                  // console.log('decorated method', name, method.toString());
                  return true
               }
            });
            // .filter(name=>methodIsDecorated.get(current_class.prototype[name]));

         class2decorated_static_methods[current_class.name] = static_methods
            .filter(name=>methodIsDecorated.get(current_class[name]));

         class2collected_tests[current_class.name] = methods
            .filter(name=> name.startsWith("test_class_"));
         // name2collected_method = {};
         collected_tests = [];
         collected_classes[args[0].name] = args[0];

         current_class.__filename = (new Error().stack.match(new RegExp('(' + process.cwd() + '/([^:]*)):')) || [])[1];

      }

      // if(args[1]?.kind === 'method' && !args[1]?.static) {
      //    methodIsDecorated.set(args[0], true);
      // }
      //
      // if(args[1]?.kind === 'method' && args[1]?.static) {
      //    methodIsDecorated.set(args[0], true);
      // }


   } else {
      if(katchMode === 1) {
         KatchArgsMode1 = args;
         throw Katch.break;
      } else if(katchMode === 2) {
         throw new Error('Deprecated');
         return Katch.current_fire
      } else {
         throw `unknown katchMode ${katchMode}`
      }

   }

};

let object2context = new WeakMap();

Katch.current_fires = [];

Katch.context = (o) => {
   return object2context.get(o);
}

Katch.Request = function(...args) {
   if(katchMode === 1) {
      KatchArgsMode1 = ['request', args]
      throw Katch.break
   }

   if(katchMode === 2) {
      return Katch.current_fire
   }
}

Katch.Event = function(...args) {
   if(katchMode === 1) {
      KatchArgsMode1 = ['event', args]
      throw Katch.break
   }

   if(katchMode === 2) {
      return Katch.current_fire
   }
}

Katch.RequestEvent = function(...args) {
   if(katchMode === 1) {
      KatchArgsMode1 = ['requestevent', args]
      throw Katch.break
   }

   if(katchMode === 2) {
      return Katch.current_fire
   }

}

Katch.current_request_handler_ready = false;
Katch.current_request_handler_continue = new Promise(()=>{});
Katch.current_request_handler_prio = 10;

Katch.requestHandlerReady = function({prio = 10} = {}) {
   Katch.current_request_handler_ready = true;
   Katch.current_request_handler_prio = prio;
   return Katch.current_request_handler_continue;
}

export const Fire = {
   Event(o,e) {
      return o.fireEvent(e);
   },
   Request(o,r) {
      return o.fireRequest(r);
   }
}


Katch.Class = class {
   context = {}

   $<T>(constructor: new () => T) {
      return Object.values(this.context.objects).find(_=>_.constructor.name === constructor.name) as T || (() => {throw new Error('Object ' + constructor.name + ' not found in context')})()
   }

   async fireEvent(event) {
      let currentClass  = this.constructor;
      let _trigger_name = event._trigger_name   || event.constructor._trigger_name
      let _class_name   = event._class_name     || event.constructor._class_name

      if(!_trigger_name.match(/Event_/)) {
         throw new Error('Trying to Fire.Event on ' + _trigger_name);
      }

      addStatsD('event.' + _class_name + '.' + _trigger_name)

      if(event instanceof Function) {
         event = event.call(currentClass);
      }

      // while(currentClass) {
      //    if(currentClass.hasOwnProperty(_trigger_name)) {
            let triggerName = _class_name + '.' + _trigger_name;
            for(let [object, method, filter, arg2path] of this.context.listeners_event[triggerName] || []) {

               let filter_passed = true;

               if(filter instanceof Function) {
                  // no filter
               } else {
                  filter_passed = (function recurseCheckFilter(val, comparator) {
                     if(val && typeof comparator === 'object') {
                        for(let key in comparator) {
                           if(!recurseCheckFilter(val[key], comparator[key])) {
                              return false
                           }
                        }
                     } else {
                        if(val !== comparator) {
                           return false
                        }
                     }
                     return true;
                  })(event, filter);
               }

               if(!filter_passed) {
                  continue;
               }

               if(Katch.current_fire) {
                  Katch.current_fires.push(Katch.current_fire);
               }

               Katch.current_fire = event;

               // Promise.allSettled()
               try {
                  let t0 = Date.now();
                  let promise = object[method](...arg2path.map(path => {let cursor = event; for(let key of path) {cursor = cursor[key]}; return cursor}));
                  promise.then(result => {
                     let dt = Date.now() - t0;
                     addStatsD('method.' + object.constructor.name + '.' + method, dt, "ms")
                  })
               } catch(e) {
                  console.log(e && e.stack || e, this, object, method, event);
               }

               Katch.current_fire = Katch.current_fires.pop();
            }
      //    }
      //    currentClass = Object.getPrototypeOf(currentClass);
      // }

   }

   async fireRequest(request) {
      let currentClass = this.constructor;
      let _trigger_name = request._trigger_name || request.constructor._trigger_name
      let _class_name   = request._class_name   || request.constructor._class_name

      if(!_trigger_name.match(/Request_/)) {
         throw new Error('Trying to Fire.Request on ' + _trigger_name);
      }

      addStatsD('event.' + _class_name + '.' + _trigger_name)

      let async_handlers_queue = [];

      if(request instanceof Function) {
         request = request.call(currentClass);
      }


      // while(Katch.debug = currentClass) {
      //    if(currentClass.hasOwnProperty(_trigger_name)) {
            let triggerName = _class_name + '.' + _trigger_name;
            for(let [object, method, filter, arg2path] of this.context.listeners_request[triggerName] || []) {

               let filter_passed = true;

               if(filter instanceof Function) {
                  // no filter
               } else {
                  filter_passed = (function recurseCheckFilter(val, comparator) {
                     if(typeof comparator === 'object') {
                        for(let key in comparator) {
                           if(!recurseCheckFilter(val[key], comparator[key])) {
                              return false
                           }
                        }
                     } else {
                        if(val !== comparator) {
                           return false
                        }
                     }
                     return true;
                  })(request, filter);
               }

               if(!filter_passed) {
                  continue;
               }

               if(Katch.current_fire) {
                  Katch.current_fires.push(Katch.current_fire);
               }

               Katch.current_fire = request;

               // Promise.allSettled()
               let Continue = {};
               try {
                  Katch.current_request_handler_continue = new Promise(r=>{Continue.fn = r})
                  Katch.current_request_handler_ready = false
                  Katch.current_request_handler_prio = 10;
                  Continue.resultPromise = object[method](...arg2path.map(path => {let cursor = request; for(let key of path) {cursor = cursor[key]}; return cursor}));
               } catch(e) {
                  console.log(e && e.stack || e, this, object, method, request);
               }
               if(Katch.current_request_handler_ready) {
                  async_handlers_queue.push({prio: Katch.current_request_handler_prio, Continue, object, _class_name: object.constructor.name, method});
               }

               Katch.current_fire = Katch.current_fires.pop();
            }
      //    }
      //    currentClass = Object.getPrototypeOf(currentClass);
      // }

      async_handlers_queue.sort((a,b)=>a.prio - b.prio)

      for(let it of async_handlers_queue) {
         it.Continue.fn();
         let t0 = Date.now();
         let result = await it.Continue.resultPromise;
         let dt = Date.now() - t0;
         addStatsD('method.' + it.object.constructor.name + '.' + it.method, dt, 'ms')
         if(typeof result !== 'undefined') {
            return result
         }
      }

      Katch.debug = request
      throw new Error('Request ' + triggerName + ' was not satisfied')

   }


   async fireRequestEvent(request) {
      throw new Error("Not implemented")
   }

}
// Katch.EventPoint = function() {
//    return class {}
// }
// Katch.RequestPoint = function() {
//    return class request {}
// }

// Katch.test = function(...args) {
//    collected_tests.push(args[2].value);
// }



Katch.createContext = function() {

}

Katch.addInstanceToContext = function() {

}

Katch.emit = function() {

}

Katch.noop = new class noop {};

Katch.debug = undefined
// Object.defineProperty(Katch, 'debug',{ set(value){ console.log(new Error().stack.split("\n")[2].match(/[^\s/:]+:[0-9]+:[0-9]+/)[0] + ' =', value)} } )
Object.defineProperty(Katch, 'debug', {
   set: function set(value) {

     let e = new Error, e_stack = e.stack;
      // if(Error.captureStackTrace) {
      //    Error.captureStackTrace(e, set)
      //    let prepareStackTrace = Error.prepareStackTrace
      //    let stackFrames;
      //    Error.prepareStackTrace = (e, stack) => {
      //       stackFrames = stack
      //       stackFrames.splice(1)
      //       return prepareStackTrace?.(e, stack)
      //    }
      //    e.stack
      //    Error.prepareStackTrace = prepareStackTrace
      //    console.log(e.stack.split("\n").slice(1).join("\n") + " = ", value)
      //    console.log(stackFrames.map(it=>[
      //       'getColumnNumber',
      //       'getEnclosingColumnNumber',
      //       'getEnclosingLineNumber',
      //       'getEvalOrigin',
      //       'getFileName',
      //       'getFunction',
      //       'getFunctionName',
      //       'getLineNumber',
      //       'getMethodName',
      //       'getPosition',
      //       'getPromiseIndex',
      //       'getScriptNameOrSourceURL',
      //       'getScriptHash',
      //       'getThis',
      //       'getTypeName',
      //       'isAsync',
      //       'isConstructor',
      //       'isEval',
      //       'isNative',
      //       'isPromiseAll',
      //       'isToplevel',
      //       'toString'].reduce((r,v)=>{r[v] = it[v](); return r},{}))
      //    );
      // }

      const stack = e_stack?.split("\n")[2]; // Get the second line of the stack trace
      const lineMatch = stack?.match(/:(\d+):\d+/); // Extract the line number
      const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : null;
      const fileNameMatch = stack?.match(/([^(\s]+):\d+:\d+/); // Extract the file name
      const fileName = fileNameMatch ? fileNameMatch[1] : 'unknown';

      let methodName = 'unknown';
      let methodMatch, methodStartLine;
      if (lineNumber && fileName !== 'unknown') {
         const filePath = fileName;

         try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');

            try {
               const fileLines = fileContent.split('\n');
               for(methodStartLine = lineNumber - 1; methodStartLine >= 0; methodStartLine--) {
                  const targetLine = fileLines[methodStartLine];
                  methodMatch = targetLine.match(/^\s*(export\s+)?(async\s+)?(function\s+)?([a-zA-Z0-9_$]+)\s*\(.*\)\s*\{/);
                  if(methodMatch) {
                     if(['','if', 'while', 'for', 'loop'].indexOf(methodMatch[4]) > 0) {
                        continue
                     }
                     break;
                  }
               }
            } catch (e) {
               console.log(e)
            }
         } catch (e) {
            //
         }

         methodName = methodMatch ? methodMatch[4] : 'unknown';
      }
      let msg = `[${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0,19)}] ${fileName.match(/[^\/]+$/)}:${methodName}():${methodStartLine > 0 ? lineNumber - methodStartLine - 1: 0}${lineMatch[0]} =`;
      let [,col,row] = lineMatch[0].split(':').map(_=>Math.floor(_));
      // eval(`//# sourceURL=${fileName}\n${ ''.padEnd(col - 3, '\n').split("\n").map(_=>"((_=>{}))();\n").join("")}${''.padEnd(row - 6, ' ')}// console.log(msg, value);`);
      // eval(`//# sourceURL=${fileName}\n${ ''.padEnd(col - 3, '\n').split("\n").map(_=>"((_=>{}))();\n").join("")}${''.padEnd(row - 6, ' ')}console.log(msg, value);`);
      // eval(`//# sourceURL=${fileName}-\n${''.padEnd(col - 3, '\n').split("\n").map(_=>"((_=>{}))();\n").join("")}${''.padEnd(row - 6, ' ')}console.log(msg, value);`);
      // eval(`//# sourceURL=${fileName}\n${ ''.padEnd(col - 3, '\n').split("\n").map(_=>"((_=>{}))();\n").join("")}${''.padEnd(row - 6, ' ')}console.log(msg, value);`);
      eval(`//# sourceURL=/${fileName}\n${ ''.padEnd(col - 2, '\n')}${''.padEnd(row - 6, ' ')}console.log(${value?.stack ? `'\x1b[31m' + value.stack + '\x1b[0m', '\\n' + `: ``}msg, value${value?.stack? ', "\\n"': ''});`);
      // console.log({col, row})
   }
});
Object.defineProperty(Katch, 'debugger',{ set(value){ console.log(new Error().stack.split("\n")[2].match(/[^\s/:]+:[0-9]+:[0-9]+/)[0] + ' =', value); debugger} } )

Katch.investigation = async function() {
   let e = new Error('Need investigation');
   Error.captureStackTrace(e, Katch.investigation)
   setTimeout(()=>{throw e}, 0);
   while(!global.investigation_finished) {
      await new Promise(resolve => setTimeout(resolve, 1000));
   }
}

let contexts = {
   // App: {
   //    classes: [],
   //    objects: [],
   //    listeners_event: [],
   //    listeners_request: [],
   //    listeners_requestevent: [],
   // }
   // App: new KatchContext()
};

Katch.EventPoint = <T>(_point_args: { new(...args:any): T }): ((args?: { [K in keyof T]?: T[K] }) => T) & { new(args?: { [K in keyof T]?: T[K] }): T } => {
   return (args?: { [K in keyof T]?: T[K] }):T=>[_point_args, args]
}

Katch.RequestPoint = <T>(_point_args: { new(...args:any): T }): ((args?: { [K in keyof T]?: T[K] }) => T) & { new(args?: { [K in keyof T]?: T[K] }): T } => {
   return (args?: { [K in keyof T]?: T[K] }):T=>[_point_args, args]
}


let current_class = null;
let collected_classes = {};
let class2collected_methods = {};

Katch.classes = {}

Katch.break = Symbol()

/*
нужны в местах:
- декларировать эвенты
- при парсинге определять, что был декларирован эвент (можно через префикс)
- при генерации события и его отправке
- при "нацеливании" на эвент
- при отправке функции
 */

let parsed_events = []

// @Katch
export class KatchApp extends Katch.Class {
   static Request_Init = Katch.RequestPoint({});
   static Event_Inited = Katch.EventPoint({});
   static context = [];
}

if (!module.parent)  {
   KatchContext.initFromCommandLine()
}

export function _(type, params = {}) {

   if(!(this instanceof _)) {
      // @ts-ignore
      return new _(type, params)
   }

   this.type = type
   this.params = params

   Object.defineProperty(this, "check", {enumerable: false, writable: true});

   this.check = function(o) {
      for(let i in params) {
         if(o[i] !== params[i]) {
            return false
         }
      }
      return true
   }

   console.warn('underscore substitute operator _ is partially implemented')
}


type Constructor<T> = new(...args: any[]) => T

export function mixin<T1>(...MixIns: [Constructor<T1>]): Constructor<T1>;
export function mixin<T1, T2>(...MixIns: [Constructor<T1>, Constructor<T2>]): Constructor<T1&T2>;
export function mixin<T1, T2, T3>(...MixIns: [Constructor<T1>, Constructor<T2>, Constructor<T3>]): Constructor<T1&T2&T3>;
export function mixin(...MixIns) {
   class Mix{ };

   Mix.mixin = [];
   (function recursiveListMixins(MixIns) {
      for(let MixIn of MixIns) {
         if(Mix.mixin.indexOf(MixIn) === -1) {
            Mix.mixin.push(MixIn);
         }
         if(MixIn.mixin) {
            recursiveListMixins(MixIn.mixin);
         }
      }
   })(MixIns);


   for (const MixIn of Mix.mixin) {
      let mixin_key;
      if(!(mixin_key = mixinMap.get(MixIn))) {
         mixinMap.set(MixIn, mixin_key = Math.random().toString(36).substring(2));
      }
      if(!MixIn[Symbol.hasInstance]) {
         MixIn[Symbol.hasInstance] = function(instance) {
            if(instance.constructor[mixin_key]) {
               return true;
            }
         }
      }
      Object.getOwnPropertyNames(MixIn.prototype).forEach(name => {
         Mix.prototype[name] = MixIn.prototype[name];
      });
      (Object.getOwnPropertyNames(MixIn)).forEach(name => {
         if(['prototype', 'length', 'name'].indexOf(name) > -1) {
            return
         }

         Mix[name] = MixIn[name];
      });
   }

   return Mix;
}

Katch.Entity = class extends Katch.Class {
   static Event_Created = Katch.EventPoint(class{});
   static Event_Updated = Katch.EventPoint(class{});
   static Event_Deleted = Katch.EventPoint(class{});
c
   static Request_Get    = Katch.RequestPoint(class{Entity; Class});
   static Request_Save   = Katch.RequestPoint(class{Entity; Class});
   static Request_Delete = Katch.RequestPoint(class{Entity; Class});
   static Request_List   = Katch.RequestPoint(class{Entity; Class});


   _cache$ = {};

   _updates_timestamp2key$ = {};

   _constructOrFetchByIdProps(_id, props = null) {

      if(!this.context._cache)                 { this.context._cache = {} }
      if(!this.context._updates_timestamp2key) { this.context._updates_timestamp2key = {}}
      if(!this.context.ts2obj)                 { this.context.ts2obj = {} }
      if(!this.context.ts2obj_saving)          { this.context.ts2obj_saving = {} }
      if(!this.context.queue_ts)               { this.context.queue_ts = Date.now() }
      if(!this.context.queue_ts_num)           { this.context.queue_ts_num = 0 }
      if(!this.context._id2saving_lock)        { this.context._id2saving_lock = {} }
      if(!this.context._backgroundSaveBusy)    { this.context._backgroundSaveBusy = false }


      if(props === false) {
         return typeof this.context._cache[_id] !== 'undefined';
      }

      let module;
      for(let i in this.context.objects) {
         if(this.context.classes[i]?.Model?._prefix === (_id.match(/^[a-zA-Z0-9]+-/)[0])) {
            module = this.context.classes[i];
            break;
         }
      }

      let exists = false;
      if(!this.context._cache[_id]) {
         let o = new module.Model();
         o._id = _id;
         this.context._cache[_id] = o;
      } else {
         exists = true;
      }

      let o = this.context._cache[_id];

      if(!o._loaded) {
         Object.defineProperty(o, '_loaded', {
            value: undefined,
            writable: true,
            enumerable: false,
            configurable: true,
         });
      }

      if(!o._3wayMerge) {
         Object.defineProperty(o, '_3wayMerge', {
            value: (new_data) => {
               if(!o._loaded) {
                  Katch.debug = `should not work this way _id=${_id} `
                  debugger
                  return
               }

               this._mergeDataFromDb(o, new_data, o._loaded);

               o._loaded = new_data
            },
            writable: true,
            enumerable: false,
            configurable: true,
         });
      }

      if(props) {
         if(!o._loaded) {
            props = JSON.parse(JSON.stringify(props));
            this._updateLinks(props);

            for(let i in props) {
               o[i] = props[i];
            }
            delete o._need_load;
            delete o.then;
         }
      } else {
         if(!exists) {
            Object.defineProperty(o, '_need_load', {
               value: true,
               writable: true,
               enumerable: false,
               configurable: true,
            });
            Object.defineProperty(o, 'then', {
               value: async(resolve) => {
                  if(o._need_load && o._need_load !== true) {
                     resolve(await o._need_load);
                     return this._proxy_wrap(o)
                  }
                  if(!o._need_load) {
                     resolve(this._proxy_wrap(o));
                     return this._proxy_wrap(o);
                  }

                  o._need_load = (async () => {

                     let result = await this.fireRequest(module.Request_Get({ _id}));

                     // deep copy

                     this._mergeDataFromDb(o, result);

                     delete o._need_load;
                     delete o.then;

                     o._loaded = result;

                     resolve(this._proxy_wrap(o));
                     return this._proxy_wrap(o)
                  })();
                  return await o._need_load;
               },
               writable: false,
               enumerable: false,
               configurable: true,
            });
         }
      }

      return this._proxy_wrap(o);
   }

   _mergeDataFromDb(to, from, old = null) {
      if(!old) {
        old = to
      }
      try {
         for(let i in old) {
            if(!(i in from)) {
               delete to[i];
            }
         }
      } catch (e) {
         Katch.debug = old?._id;
         Katch.debug = to?._id;
         Katch.debug = from?._id;
         Katch.debug = e;
         Katch.debug = process.env;
         throw e
      }
      for(let i in from) {
         if(i.match(/^[A-Z]/) && ( typeof from[i] === 'string' ? from[i].match(/^[a-zA-Z0-9]+-/)  : from[i]._id )) {
            to[i] = this._constructOrFetchByIdProps((typeof from[i] === 'string' ? from[i] : from[i]._id));
         } else {
            if(from[i] && typeof from[i] === 'object') {
               if(!old[i] || typeof old[i] !== 'object' || typeof to[i] !== 'object') {
                  if(from[i] instanceof Array) {
                     to[i] = [];
                  } else {
                     to[i] = {};
                  }
               }
               this._mergeDataFromDb(to[i], from[i], old[i]);
            } else {
               if(old[i] !== from[i]) {
                  if(old[i] !== to[i]) {
                     if(from[i] !== to[i]) {
                        Katch.debug = `value has changed twice: _id=${from._id || 'not_detected'} field=${i} old=${old[i]} new=${from[i]} current=${to[i]}`
                     }
                  }
                  to[i] = from[i];
               }
            }
         }
      }
   }

   _updateLinks(o) {
      // Katch.debug = 'deprecated'
      for(let i in o) {
         if(i.match(/^[A-Z]/) && ( typeof o[i] === 'string' ? o[i].match(/^[a-zA-Z0-9]+-/)  : o[i]._id )) {
            o[i] = this._constructOrFetchByIdProps((typeof o[i] === 'string' ? o[i] : o[i]._id));
         }
      }
   }


   ts2obj$  = {};
   ts2obj_saving$ = {};
   queue_ts$ = Date.now();
   queue_ts_num$ = 0;
   _id2saving_lock$ = {};

   _backgroundSaveBusy$ = false

   async _waitConsistency() {
      const waitForTs = (Date.now() + 1) * 1000;
      let need_break = false;
      main_loop:
      while(true) {
         need_break = true;
         for(let ts in this.context.ts2obj) {
            need_break = false;
            if(Math.floor(ts) > waitForTs) {
               break main_loop;
            }
            break;
         }
         if(need_break) {
            break;
         }
         await new Promise(resolve => setTimeout(resolve, 1));
      }
   }

   _backgroundSave() {
      if(this.context._backgroundSaveBusy) {
         return;
      }
      this.context._backgroundSaveBusy = true
      let _id2saving_now = {};
      for(let i in this.context.ts2obj) {

         let o = this.context.ts2obj[i];
         let _id = o._id;

         if(this.context._id2saving_lock[_id]) {
            if(_id2saving_now[_id]) {
               this.context.ts2obj_saving[i] = o;
            }
            continue;
         }
         _id2saving_now[_id] = true;
         this.context._id2saving_lock[_id] = true;
         this.context.ts2obj_saving[i] = o;

         let module;
         for(let i in this.context.objects) {
            if(this.context.classes[i]?.Model?._prefix === o._id.match(/^[a-zA-Z0-9]+-/)[0]) {
               module = this.context.classes[i];
               break;
            }
         }
         let Entity = this._constructOrFetchByIdProps(this.context.ts2obj[i]._id)

         this.fireRequest(module.Request_Save({Entity}))
            .then((raw_data) => {
               this.context._cache[_id]._loaded = raw_data

               let o = this.context.ts2obj_saving[i];
               for(let i in this.context.ts2obj_saving) {
                  if(this.context.ts2obj_saving[i] === o) {
                     delete this.context.ts2obj_saving[i];
                     delete this.context.ts2obj[i];
                  }
               }
               delete this.context._id2saving_lock[_id];
               this._backgroundSave();
               this.fireEvent(module.Event_Updated({Entity: this._constructOrFetchByIdProps(o._id)}));
            })
            .catch((e) => {
               Katch.debug = e
               let o = this.context.ts2obj_saving[i];
               for(let i in this.context.ts2obj_saving) {
                  if(this.context.ts2obj_saving[i] === o) {
                     delete this.context.ts2obj_saving[i];
                  }
               }
               delete this.context._id2saving_lock[_id];
               this._backgroundSave();
            })
      }

      this.context._backgroundSaveBusy = false
   }

   static _proxy_target = Symbol('_proxy_target')

   static o2proxy = new WeakMap();

   // recursive proxy, если базовый объект глубоко меняется, должен сделать _updated = true
   _proxy_wrap(o, key = '', base = null) {
      if(Katch.Entity.o2proxy.has(o)) {
         return Katch.Entity.o2proxy.get(o);
      }
      if(!base) {
         base = o;
      }
      try {
         Katch.Entity.o2proxy.set(o, new Proxy(o, {
            get: (target, prop) => {

               let is_array = Array.isArray(target);
               let last_key = (key.match(/\.([^.]+)$/) || [])[1] || '';

               if (prop === Symbol.hasInstance) {
                  return function(_) {
                     return target instanceof _;
                  }
               }
               if (prop === Katch.Entity._proxy_target) {
                  return target
               }
               if (prop === 'toJSON') {
                  let existing = new Set();
                  let level = 0;
                  return function collapse() {
                     let o = {};
                     let self = this[Katch.Entity._proxy_target] || this;

                     if(!existing.has(self)) {
                        existing.add(self);
                     }
                     if(self instanceof Array) {
                        return self
                     }
                     for(let i in self) {
                        if(self.hasOwnProperty(i) && i.match(/^[A-Z]/) && self[i] && typeof self[i] === 'object' && self[i]._id) {
                           o[i] = self[i]._id
                           continue;
                        }
                        if(self[i] && typeof self[i] === 'object') {
                           // if(new Error().stack.split("\n").length > 100) {
                           //    debugger
                           // }
                           if (existing.has(self[i])) {
                              o[i] = '__loop__'
                              continue
                           }
                           level++;
                           if(level > 1000) {
                              debugger
                           }
                           o[i] = collapse.call(self[i])
                           level--;
                           continue
                        }
                        if(typeof self[i] === 'bigint') {
                           o[i] = Number(self[i])
                           continue
                        }
                        o[i] = self[i]
                     }
                     return o;
                  }
               }
               if(
                  typeof prop === 'string' && prop.match(/^[A-Z]/) &&
                  typeof target[prop] === 'string' && target[prop].match(/^[a-zA-Z0-9]+-/)
               ) {
                  return this._constructOrFetchByIdProps(target[prop])
               }

               if(
                  is_array && typeof prop !== 'symbol' && Number(prop) == prop &&
                  last_key.match(/^[A-Z]/) &&
                  typeof target[prop] === 'string' && target[prop].match(/^[a-zA-Z0-9]+-/)
               ) {
                  return this._constructOrFetchByIdProps(target[prop])
               }
               if(typeof target[prop] === 'object') {
                  // if(target[prop] && Object.keys(target[prop]).filter((k,v)=>k!=v).length == 0 && (Object.keys(target[prop]).length || prop.match(/[s]$/))) {
                  //    return Object.values(target[prop]);
                  // }
                  if(target[prop] !== null) {
                     if(typeof prop === 'string' && prop.match(/^[A-Z]/) && target[prop]?._id) {
                        return this._constructOrFetchByIdProps(target[prop]._id);
                     }
                     return this._proxy_wrap(target[prop], key + '.'  + prop.toString(), base);
                  } else {
                     return null;
                  }
               } else{
                  return target[prop];
               }
            },
            // deleteProperty(target: any, p: string | symbol): boolean {
            //    delete target[p];
            //
            //    if(this.context.queue_ts !== Date.now()) {
            //       this.context.queue_ts = Date.now()
            //       this.context.queue_ts_num = 0;
            //    }
            //    if(this.context.queue_ts_num > 999) {
            //       while(this.context.queue_ts === Date.now()) {
            //          continue
            //       }
            //       this.context.queue_ts = Date.now()
            //       this.context.queue_ts_num = 0;
            //    }
            //    this.context.ts2obj[this.context.queue_ts * 1000 + this.context.queue_ts_num] = base;
            //    this.context.queue_ts_num++;
            //    setTimeout(() => {
            //       this._backgroundSave()
            //    }, 0);
            //
            //
            //    return true;
            // },
            set: (target, prop, value) => {

               let is_array = Array.isArray(target);
               let last_key = (key.match(/\.([^.]+)$/) || [])[1] || '';

               if(!key && Number(prop) == prop) {
                  debugger
               }

               // Katch.debug = [target, prop, value, base, key]
               let changed = false;
               if(((typeof prop === 'string' && prop.match(/^[A-Z]/)) || (is_array && Number(prop) == prop && last_key.match(/^[A-Z]/)) ) && (value?._id || (typeof value === 'string' && value.match(/^[a-zA-Z0-9]+-/)))) {
                  changed = true;
                  target[prop] = (typeof value === 'string' ? value : value._id);
               } else {

                  if(value && typeof value === 'object' && value instanceof Array && typeof prop === 'string' && prop.match(/^[A-Z]/)) {
                     changed = true;
                     target[prop] = value.map(it => it._id || it);
                  } else if(value && value[Katch.Entity._proxy_target]) {
                     if(target[prop] !== value[Katch.Entity._proxy_target]) {
                        target[prop] = value[Katch.Entity._proxy_target]
                        changed = true;
                     }
                  } else if(target[prop] !== value) {
                     // Katch.debug = prop;
                     // Katch.debug = value;
                     changed = true;
                     target[prop] = value;

                     if(prop.match(/TS$/)) {
                        target[prop.replace(/TS$/, 'ISO')] = new Date(value * 1000).toISOString();
                     }
                  }
               }
               if(changed) {
                  if(this.context.queue_ts !== Date.now()) {
                     this.context.queue_ts = Date.now()
                     this.context.queue_ts_num = 0;
                  }
                  if(this.context.queue_ts_num > 999) {
                     while(this.context.queue_ts === Date.now()) {
                        continue
                     }
                     this.context.queue_ts = Date.now()
                     this.context.queue_ts_num = 0;
                  }
                  this.context.ts2obj[this.context.queue_ts * 1000 + this.context.queue_ts_num] = base;
                  this.context.queue_ts_num++;
                  setTimeout(() => {
                     this._backgroundSave()
                  }, 0);
               }
               return true;
            }
         }))
         return Katch.Entity.o2proxy.get(o);
      } catch (e) {
         Katch.debug = {key}
         Katch.debug = e
      }
   }

   async get(_id, props?:{ [K in keyof InstanceType<typeof this.constructor.Model>]?: InstanceType<typeof this.constructor.Model>[K] }):Promise<InstanceType<typeof this.constructor.Model>> {
      // await this._waitConsistency();

      // Katch.debug = { _id, props }
      //

      if(this._constructOrFetchByIdProps(_id, false)) {
         let o = this._constructOrFetchByIdProps(_id);
         if(o._loaded) {
            return o
         }
         let result = await this.fireRequest(this.constructor.Request_Get({ _id }));
         if(result) {
            return this._constructOrFetchByIdProps(_id);
         } else if(props && this._constructOrFetchByIdProps(_id)._need_load) {
            let o = this._constructOrFetchByIdProps(_id, {});
            for(let i in props) {
               o[i] = props[i];
            }
            return o;
         }
      }

      let result = await this.fireRequest(this.constructor.Request_Get({ _id }));

      if(result) {
         let o = await this._constructOrFetchByIdProps(_id);
         return o;
      }

      if(props) {
         let o = this._constructOrFetchByIdProps(_id, {});
         for(let i in props) {
            o[i] = props[i];
         }
         return o;
      }

      throw new Error('Object with _id ' + _id + ' not found');
   }

   async list(filter, options?) {
      await this._waitConsistency();

      filter = JSON.parse(JSON.stringify({filter}, (k,v) => {
         if(k.match(/^[A-Z]/) && v?._id) {
            return v._id
         } else
         if(k.match(/^[A-Z]|^_id$/) && v?.$in) {
            return {$in: v.$in.map(o => o._id)}
         } else
         if(k.match(/^[A-Z]|^_id$/) && v?.$nin) {
            return {$nin: v.$nin.map(o => o._id)}
         } else {
            return v
         }
      })).filter;

      let results = await this.fireRequest(this.constructor.Request_List({ filter, options: {...options, projection: { _id: 1 }} }));

      let returning = [];
      for(let o of results) {
         returning.push(await this._constructOrFetchByIdProps(o._id));
      }

      return returning;
   }

   // async cleanCache() {
   //    Katch.Event(DbClient.Event_Connected);
   //
   //    setInterval(() => {
   //       // Katch.debug = 'cleaning cache';
   //       for(let i in this._cache) {
   //          if(!this._cache[i].deref()) {
   //             delete this._cache[i];
   //          }
   //       }
   //    }, 2000)
   // }


}

const mixinMap = new Map();

Object.defineProperty(Katch, 'test_method'      , {get(){ return 'test_method_'      + Math.random().toString(36).substring(2) }, enumerable: false})
Object.defineProperty(Katch, 'test_class'       , {get(){ return 'test_class_'       + Math.random().toString(36).substring(2) }, enumerable: false})
Object.defineProperty(Katch, 'test_integration' , {get(){ return 'test_integration_' + Math.random().toString(36).substring(2) }, enumerable: false})
Object.defineProperty(Katch, 'test_system'      , {get(){ return 'test_system_'      + Math.random().toString(36).substring(2) }, enumerable: false})

global.Katch = Katch;
Katch.contexts = contexts;

let changed_files = {
   '/Users/os/okneigres-repos/telegram-sniper/DumbApp.class.ts': {}
}

if(!process.env.NOWATCH) {
   let chokidar = require('chokidar');

   const watcher = chokidar.watch(process.cwd(), {
      ignored: /node_modules|\.git|tmp|out/,
      persistent: true
   });


   watcher.on('change', (path) => {
      console.log(`File ${path} has been changed`);
      changed_files[path] = {};
   });
}

Katch.reload = () => {
   for(let i in changed_files) {
      for(let classname in Katch.classes) {
         let classInstance = Katch.classes[classname];
         let filename = classInstance.__filename;
         if(changed_files[filename]) {
            delete require.cache[filename];
            let new_module = require(filename);

            // теперь обновим статические и обычные методы

            for(let export_name in new_module) {
               if(export_name !== classname) {
                  continue;
               }
               let moduleExport = new_module[export_name];
               if(typeof moduleExport !== 'function') {
                  throw new Error('Wrong export ' + export_name + ', must be class')
               }
               for(let static_method_name in moduleExport) {
                  if(typeof moduleExport[static_method_name] === 'function') {
                     // Katch.debug = 'updating static method ' + static_method_name;
                     if(static_method_name.match(/^(Consumer_)?(Request|Event)_/)) {
                        continue;
                     }
                     classInstance[static_method_name] = moduleExport[static_method_name];
                  }
               }
               for(let method_name of Object.getOwnPropertyNames(moduleExport.prototype)) {
                  if(typeof moduleExport.prototype[method_name] === 'function') {
                     if(method_name === 'constructor') {
                        continue;
                     }
                     // Katch.debug = 'updating method ' + method_name;
                     classInstance.prototype[method_name] = moduleExport.prototype[method_name];
                  }
               }
            }

         }
      }
   }
   // changed_files = {}
}

// console.log(katch);

const os = require('os');

function getCpuUsageSnapshot() {
   const cpus = os.cpus();

   let idle = 0;
   let total = 0;

   for (const cpu of cpus) {
      for (const type in cpu.times) {
         total += cpu.times[type];
      }
      idle += cpu.times.idle;
   }

   return { idle, total };
}

export function calculateCpuUsageOverTime(delay = 5000) {
   return new Promise((resolve) => {
      const start = getCpuUsageSnapshot();

      setTimeout(() => {
         const end = getCpuUsageSnapshot();

         const idleDelta = end.idle - start.idle;
         const totalDelta = end.total - start.total;

         const usage = 1 - idleDelta / totalDelta;
         resolve(usage * 100); // в процентах
      }, delay);
   });
}

export async function waitForCpuBelow(threshold = 80, sampleTime = 5000, checkInterval = 1000, maxTime = 1200) {
   let t0 = Date.now();
   while (true) {
      const usage = await calculateCpuUsageOverTime(sampleTime);

      if (usage < threshold) {
         Katch.debug = 'Дождались за ' + ((Date.now() - t0) / 1000).toFixed(0) + ' секунд';
         return; // Условие выполнено — возвращаем управление
      }

      if((Date.now() - t0) / 1000 > maxTime) {
         Katch.debug = 'Не дождались за ' + ((Date.now() - t0) / 1000).toFixed(0) + ' секунд';
         return
      }

      Katch.debug = (`Средняя загрузка CPU за ${sampleTime / 1000} секунд: ${usage.toFixed(1)}%. Загрузка выше ${threshold}%, жду уже ${((Date.now() - t0) / 1000).toFixed(0)} сек...`);
      await new Promise(r => setTimeout(r, checkInterval));
   }
}