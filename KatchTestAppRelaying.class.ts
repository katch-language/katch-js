import {Katch} from "./katch";
import {KatchTestApp} from "./KatchTestApp.class";

@Katch
export class KatchTestAppRelaying extends Katch.Class {

   static initWith = [KatchTestApp];


}