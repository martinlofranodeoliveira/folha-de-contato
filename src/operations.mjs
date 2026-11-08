import {newProject,validateProject} from './model.mjs';

/** One serial decoder queue; replacing/editing invalidates old commits. */
export class CatalogSession {
  #project; #revision=0; #epoch=0; #busy=false; #tail=Promise.resolve(); #listeners=new Set();
  constructor(project=newProject()){this.#project=validateProject(project);}
  get project(){return this.#project;}
  get revision(){return this.#revision;}
  get busy(){return this.#busy;}
  subscribe(listener){this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
  #emit(){for(const listener of [...this.#listeners]){try{listener();}catch{/* A subscriber cannot change an operation's result. */}}}
  edit(transform){
    const epoch=this.#epoch,revision=this.#revision;
    const next=validateProject(transform(this.#project));
    if(epoch!==this.#epoch||revision!==this.#revision)return false;
    if(next===this.#project)return false;
    this.#epoch++;this.#revision++;this.#busy=false;this.#project=next;this.#emit();return true;
  }
  replace(project){return this.edit(()=>project);}
  run(prepare){
    const epoch=++this.#epoch, revision=this.#revision, initial=this.#project;
    const current=()=>epoch===this.#epoch&&revision===this.#revision;
    this.#busy=true;
    const execution=this.#tail.then(async()=>{
      if(!current())return {applied:false,stale:true};
      try{
        const prepared=await prepare(initial,current);
        if(!current())return {applied:false,stale:true};
        const next=validateProject(prepared);
        if(!current())return {applied:false,stale:true};
        this.#project=next;this.#revision++;this.#busy=false;this.#emit();
        return {applied:true,stale:false};
      }catch(error){
        if(!current())return {applied:false,stale:true};
        this.#busy=false;this.#emit();throw error;
      }
    });
    this.#tail=execution.catch(()=>undefined);
    this.#emit();
    return execution;
  }
}
