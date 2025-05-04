
import {_, Katch} from './katch';

@Katch
export class KatchTests extends Katch.Class {

   static Event_Test1 = Katch.EventPoint({ a:_, b:_ })
   static Event_Test2 = Katch.EventPoint({ b:_, c:_ })
   static Event_Test3 = Katch.EventPoint({ b:_, c:_ })
   static Event_Test4 = Katch.EventPoint({ b:_, c:_ })
   static Event_Test5 = Katch.EventPoint({ b:_, c:_ })

   static Request_SetVar   = Katch.RequestPoint({ name:_, value:_, ignore:_ })
   static Request_SetVar2  = Katch.RequestPoint({ name:_, value:_, ignore:_ })
   static Request_SetVar3  = Katch.RequestPoint({ name:_, value:_, ignore:_ })
   static Event_VarSet     = Katch.  EventPoint({ name:_, value:_, ignore:_ })
   static Event_VarSet2    = Katch.  EventPoint({ name:_, value:_, ignore:_ })
   static Event_VarSet3    = Katch.  EventPoint({ name:_, value:_, ignore:_ })

   // async initApp() {
   //    Katch.debug = Katch.Request(KatchTests.Request_Init);
   //
   //    await Katch.requestHandlerReady({prio: 2});
   //
   //    console.log('hello from ' + __filename);
   //
   //    await this.fireEvent(Katch.debug = KatchTests.Event_Test1);
   //    await this.fireEvent(KatchTests.Event_Test1({a:2, b:2}));
   //    await this.fireEvent(KatchTests.Event_Test1({b:3}));
   //
   // }
   //
   // async catchEvent() {
   //    Katch.debug = Katch.Event(KatchTests.Event_Test1({a:2}));
   //
   //
   // }
   //
   // async catchEventSubstitute() {
   //    Katch.debug = Katch.Event(_(KatchTests.Event_Test1, {a:2}), _(KatchTests.Event_Test1, {b:3}));
   //
   //
   // }

   // @Katch.test
   // async () {
   //
   // }

   // @Katch
   // @Katch.test(() => {
   //
   // })
   // async runApp() {
   //    await Katch.event(.event.Inited);
   //
   //
   // }

   async setVar(name, value) {
      let request = Katch.Request(
         KatchTests.Request_SetVar,
         KatchTests.Request_SetVar2({filtered: true}),
         // KatchTests.Request_SetVar3({name: name, value: _(value, {$gt: 5})}),
         KatchTests.Request_SetVar3({name: name, value: value}),
      )

      await Katch.requestHandlerReady({prio: 2});

      if(request) {
         this[request.name] = request.value;
      } else {
         this[name] = value;
      }

      if(request instanceof KatchTests.Request_SetVar) {
         this.fireEvent(KatchTests.Event_VarSet ({name: request.name, value: request.value}));
      }

      if(request instanceof KatchTests.Request_SetVar2) {
         this.fireEvent(KatchTests.Event_VarSet2({name: request.name, value: request.value, filtered: request.filtered}));
      }

      if(request instanceof KatchTests.Request_SetVar3) {
         this[name] = value;
         this.fireEvent(KatchTests.Event_VarSet3({name, value}));
      }

      if(request) {
         return request.name;
      } else {
         return name
      }
   }

   async handleEventAndLog(name, value) {
      let event = Katch.Event(
         KatchTests.Event_VarSet,
         KatchTests.Event_VarSet2({name: name, value: _(value, {$gt: 7})}),
         KatchTests.Event_VarSet3({name: 'my_key'}),
      )

      Katch.debug = event;

      if(!event) {
         this['eventually_set_' + name] = value;
      } else {
         if(!event.name) {
            this.eventually_no_key = 'no value';
         }
         if (event instanceof KatchTests.Event_VarSet2) {
            this['eventually_set_' + name] = value;
         } else {
            this['eventually_set_' + event.name] = event.value;
         }
      }

   }

   async [Katch.test_class]() {

      this.fireEvent(KatchTests.Event_VarSet);

      if(this.eventually_no_key !== 'no value') {
         throw new Error('test failed')
      }

      this.fireEvent(new KatchTests.Event_VarSet({name: 'xxx', value: 'yyy'}));

      if(this.eventually_set_xxx !== 'yyy') {
         throw new Error('test failed')
      }

      this.fireEvent(KatchTests.Event_VarSet({name: 'xxxx', value: 'yyyy'}));

      if(this.eventually_set_xxxx !== 'yyyy') {
         throw new Error('test failed')
      }

      let r1 = await this.fireRequest(KatchTests.Request_SetVar({name: 'x2', value: 'y2'}));

      if(r1 !== 'x2') {
         throw new Error('test failed')
      }

      if(this.x2 !== 'y2') {
         throw new Error('test failed')
      }

      await this.fireRequest(KatchTests.Request_SetVar2({name: 'x3', value: 'y3', filtered: false}));

      if(this.x3 === 'y3') {
         throw new Error('test failed')
      }

      await this.fireRequest(KatchTests.Request_SetVar2({name: 'x4', value: 'y4', filtered: true}));

      if(this.x4 !== 'y4') {
         throw new Error('test failed')
      }

      await this.fireRequest(KatchTests.Request_SetVar3({name: 'x5', value: 6}));

      if(this.x5 !== 6) {
         throw new Error('test failed')
      }

      await this.setVar('x7', 8);

      if(this.x7 !== 8) {
         throw new Error('test failed')
      }

      await this.handleEventAndLog('x8', 9);

      if(this.eventually_set_x8 !== 9) {
         throw new Error('test failed')
      }


   }

   async handleDeepArgs(level2, level3) {
      Katch.Event(KatchTests.Event_Test1({level1 : {level2: {...level2, level3, arg4: 4}}}));

      this.eventually_set_level3 = level3;
      this.eventually_set_level2 = level2;
   }

   async [Katch.test_class]() {
      this.fireEvent(KatchTests.Event_Test1({level1: {level2: {level3: 3, arg4: 4}}}));

      if(this.eventually_set_level3 !== 3) {
         throw new Error('test failed')
      }

      if(this.eventually_set_level2.arg4 !== 4) {
         throw new Error('test failed')
      }

   }

   // async [Katch.test_integration(Logger)]() {
   //
   //    this.fireEvent(KatchTests.Event_Test1({a:2, b:3}));
   //
   // }
   //


}
