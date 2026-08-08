import type { AdminPalette } from '@/api/admin'
import { createCandidateRejectionController, createCandidateRejectionState, isCandidateRejectionEligible } from './CandidateRejection.logic'

function expect(value: boolean, message: string) { if (!value) throw new Error(message) }
function palette(status: AdminPalette['status'] = 'candidate', overrides: Partial<AdminPalette> = {}): AdminPalette {
  return { id:'candidate-1',slug:'candidate-1',name:'Candidate',colors:[],color_count:1,type:'categorical',chart_types:[],journal_style:[],discipline:[],use_case:[],tags:[],accessibility:{colorblind_safe:false,print_friendly:false,dark_background:false},source_type:'curated',status,visibility:'public',created_at:'',updated_at:'',...overrides }
}
function eligibility(overrides = {}) { return { editing:true,authenticatedAdmin:true,importedCandidate:true,canonicalStatus:'candidate' as AdminPalette['status'],dirty:false,conflictingAction:false,...overrides } }
function deferred<T>() { let resolve!:(value:T)=>void; const promise=new Promise<T>(r=>{resolve=r}); return {promise,resolve} }

expect(isCandidateRejectionEligible(eligibility()), 'imported candidate should be eligible')
for (const input of [eligibility({importedCandidate:false}),eligibility({dirty:true}),eligibility({canonicalStatus:'draft'}),eligibility({canonicalStatus:'published'}),eligibility({canonicalStatus:'archived'}),eligibility({conflictingAction:true})]) expect(!isCandidateRejectionEligible(input), 'ineligible state accepted')

let confirms=0, calls=0
const pending=deferred<AdminPalette>(), state=createCandidateRejectionState(), applied:AdminPalette[]=[]
const controller=createCandidateRejectionController({state,paletteID:()=> 'candidate-1',eligibility,confirm:()=>{confirms++;return true},reject:async()=>{calls++;return pending.promise},reload:async()=>palette(),applyCanonical:p=>applied.push(p)})
const first=controller.attempt(), second=controller.attempt()
expect(await second==='duplicate' && confirms===1 && calls===1, 'same-tick rejection must confirm and request once')
pending.resolve(palette('archived'))
expect(await first==='rejected' && applied[0]?.status==='archived' && !state.rejecting, 'canonical rejection not applied')

let dirtyConfirms=0, dirtyCalls=0
const dirty=createCandidateRejectionController({state:createCandidateRejectionState(),paletteID:()=> 'candidate-1',eligibility:()=>eligibility({dirty:true}),confirm:()=>{dirtyConfirms++;return true},reject:async()=>{dirtyCalls++;return palette('archived')},reload:async()=>palette(),applyCanonical:()=>{}})
expect(await dirty.attempt()==='ineligible' && dirtyConfirms===0 && dirtyCalls===0, 'dirty form reached confirmation/API')
const cancelled=createCandidateRejectionController({state:createCandidateRejectionState(),paletteID:()=> 'candidate-1',eligibility,confirm:()=>false,reject:async()=>{throw new Error('called')},reload:async()=>palette(),applyCanonical:()=>{}})
expect(await cancelled.attempt()==='cancelled', 'confirmation cancellation failed')

for (const status of [401,403,409,422]) {
  const errorState=createCandidateRejectionState()
  const c=createCandidateRejectionController({state:errorState,paletteID:()=> 'candidate-1',eligibility,confirm:()=>true,reject:async()=>{throw Object.assign(new Error('failed'),{status,issues:status===422?[{path:'candidate',code:'INVALID',message:'Invalid'}]:[]})},reload:async()=>palette(),applyCanonical:()=>{}})
  expect(await c.attempt()==='failed' && errorState.errorStatus===status && !errorState.rejecting, `status ${status} lost`)
  expect(status!==422 || errorState.issues[0]?.code==='INVALID', '422 issues lost')
}

const malformed=createCandidateRejectionController({state:createCandidateRejectionState(),paletteID:()=> 'candidate-1',eligibility,confirm:()=>true,reject:async()=>palette('archived',{id:'other'}),reload:async()=>palette(),applyCanonical:()=>{throw new Error('applied malformed')}})
expect(await malformed.attempt()==='failed','malformed response accepted')
const reconciled:AdminPalette[]=[]
const lost=createCandidateRejectionController({state:createCandidateRejectionState(),paletteID:()=> 'candidate-1',eligibility,confirm:()=>true,reject:async()=>{throw new TypeError('lost')},reload:async()=>palette('archived'),applyCanonical:p=>reconciled.push(p)})
expect(await lost.attempt()==='reconciled-rejected' && reconciled.length===1,'lost response not reconciled')
let retries=0
const retryState=createCandidateRejectionState()
const retry=createCandidateRejectionController({state:retryState,paletteID:()=> 'candidate-1',eligibility,confirm:()=>true,reject:async()=>{retries++;if(retries===1)throw new TypeError('lost');return palette('archived')},reload:async()=>palette(),applyCanonical:()=>{}})
expect(await retry.attempt()==='failed' && await retry.attempt()==='rejected' && retries===2,'explicit retry failed')
const uncertain=createCandidateRejectionController({state:createCandidateRejectionState(),paletteID:()=> 'candidate-1',eligibility,confirm:()=>true,reject:async()=>{throw new TypeError('lost')},reload:async()=>{throw new Error('reload')},applyCanonical:()=>{}})
expect(await uncertain.attempt()==='failed','reconciliation failure guessed success')
