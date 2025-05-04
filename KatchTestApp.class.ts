import {Katch, KatchApp} from "./katch";
import {KatchTestAppDependent} from "./KatchTestAppDependent.class";

@Katch
export class KatchTestApp extends KatchApp {

   static context = [KatchTestAppDependent];

   async init() {
      Katch.Event(KatchTestApp.Event_Inited);

      if(!KatchTestAppDependent.Of(this)) {
         throw new Error('KatchTestAppDependent not initialized');
      }

      if(!this.context.objects.KatchTestAppRelaying) {
         throw new Error('KatchTestAppRelaying not initialized');
      }

   }

}