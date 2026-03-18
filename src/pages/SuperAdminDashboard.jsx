import { useState, useEffect, useRef } from 'react'
import { collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import AppContent from '../components/AppContent'
import UserApprovalsPanel from '../components/UserApprovalsPanel'
import EscalationSettings from '../components/EscalationSettings'

const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const MONTHS      = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const YEARS       = Array.from({length:15}, (_,i) => 2026+i)
const TODAY       = new Date()

// ── Build initial data for a brand new project ────────────────
function buildInitialData(flats, maintenanceAmount=5000, openingBalance=0, buildingName='New Project') {
  return {
    flats: flats.reduce((acc,num)=>({...acc,[num]:{ownerName:"Owner "+num,ownerPhone:"9999999999",ownerEmail:"",ownerAltName:"",ownerAltPhone:"",ownerAltRelation:"",ownerStayingSince:"",ownerAdults:1,ownerKids:0,previousOwners:[],ownerOccupied:false,currentTenant:null,tenantHistory:[]}}),{}),
    collections: flats.reduce((acc,num)=>{const months={};YEARS.forEach(y=>MONTHS.forEach((_,i)=>{months[y+"-"+i]={amount:maintenanceAmount,paid:false,advance:false}}));return{...acc,[num]:months}},{}),
    paymentLedger: flats.reduce((acc,num)=>({...acc,[num]:[]}),{}),
    specialCollections:[],
    expenseCategories:{"Salary":["Watchman Salary"],"Utility – Electricity":["EB Motor","EB Sump Motor","EB Lift"],"Repair & Maintenance":["Motor Repair","Lift Repair"],"Water System Maintenance":["Bore / Pump Repair"],"Contracted Services (AMC)":["Lift AMC / Annual Service Charges"],"Operational Expenses":["Cleaning Charges / Sweeper Payment"],"Administrative & Misc":["Stationery / Bank Charges / Miscellaneous"]},
    expenses:[],meetings:[],incidents:[],watchmanLeaves:[],
    building:{name:buildingName,totalFlats:flats.length,defaultMaintenanceAmount:maintenanceAmount,openingBalance:openingBalance,shareCode:"APT"+Math.random().toString(36).substring(2,8).toUpperCase()},
    auditedPeriods:[],managingCommittee:[],
    watchman:{name:"",phone:"",photo:"",joiningDate:"",emergencyContact:"",address:"",spouseName:"",children:[],notes:""},
    pastWatchmen:[]
  }
}

// ── Calc metrics for a given month/year ──────────────────────
function calcMetrics(projectData, flats, year, month) {
  if(!projectData||!flats) return {collected:0,pending:0,expenses:0,flatsCount:0}
  const key=year+"-"+month
  const defaultAmt=parseFloat(projectData?.building?.defaultMaintenanceAmount||5000)
  let collected=0,pending=0,expenses=0
  flats.forEach(f=>{
    const c=(projectData.collections?.[f]&&projectData.collections[f][key])||{amount:defaultAmt,paid:false,advance:false}
    if(c.paid&&!c.advance) collected+=c.amount
    else if(!c.paid) pending+=c.amount
  })
  expenses=(projectData.expenses||[]).filter(e=>e.year===year&&e.month===month).reduce((s,e)=>s+e.amount,0)
  return {collected,pending,expenses,flatsCount:flats.length}
}

// ── Flat occupancy stats from project data ───────────────────
function calcOccupancy(projectData, flats) {
  if(!projectData||!flats) return {total:0,ownerOccupied:0,tenants:0,vacant:0}
  let ownerOccupied=0, tenants=0, vacant=0
  flats.forEach(f=>{
    const fd=projectData.flats?.[f]
    if(!fd){vacant++;return}
    if(fd.ownerOccupied) ownerOccupied++
    else if(fd.currentTenant) tenants++
    else vacant++
  })
  return {total:flats.length,ownerOccupied,tenants,vacant}
}

// ── Image picker helper ──────────────────────────────────────
function useImagePicker(initial='') {
  const [image,setImage]=useState(initial)
  const ref=useRef()
  function pick(file){
    if(!file) return
    const reader=new FileReader()
    reader.onload=e=>setImage(e.target.result)
    reader.readAsDataURL(file)
  }
  return {image,setImage,ref,pick}
}

// ── Add Project Modal with interactive flat grid ─────────────
function AddProjectModal({onClose,onCreated}) {
  const [step,    setStep]    = useState(1)
  const [form,    setForm]    = useState({
    name:'',address:'',floors:'',unitsPerFloor:'',startUnit:'1',
    maintenanceAmount:'5000',openingBalance:'0'
  })
  const [flatGrid,    setFlatGrid]    = useState([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [editingFlat, setEditingFlat] = useState(null)
  const [editVal,     setEditVal]     = useState('')
  const img = useImagePicker()

  function generateGrid(floors,units,start){
    const f=parseInt(floors),u=parseInt(units),s=parseInt(start)
    if(!f||!u||f<1||u<1) return []
    const result=[]
    for(let fl=1;fl<=f;fl++)
      for(let ut=s;ut<s+u;ut++)
        result.push({num:parseInt(`${fl}${String(ut).padStart(2,'0')}`),selected:true})
    return result
  }

  function handleNext(e){
    e.preventDefault(); setError('')
    if(!form.name.trim()) return setError('Building name is required.')
    const grid=generateGrid(form.floors,form.unitsPerFloor,form.startUnit)
    if(grid.length<1) return setError('Please enter valid floors and units per floor.')
    setFlatGrid(grid); setStep(2)
  }

  function toggleFlat(num){
    setFlatGrid(g=>g.map(f=>f.num===num?{...f,selected:!f.selected}:f))
  }

  function startEdit(num){ setEditingFlat(num); setEditVal(String(num)) }

  function commitEdit(oldNum){
    const newNum=parseInt(editVal)
    if(!newNum||newNum<1){setEditingFlat(null);return}
    if(flatGrid.some(f=>f.num===newNum&&f.num!==oldNum)){alert('Flat '+newNum+' already exists');return}
    setFlatGrid(g=>g.map(f=>f.num===oldNum?{...f,num:newNum}:f))
    setEditingFlat(null)
  }

  const selectedFlats=flatGrid.filter(f=>f.selected).map(f=>f.num).sort((a,b)=>a-b)

  function groupByFloor(){
    const g={}
    flatGrid.forEach(f=>{const fl=Math.floor(f.num/100);if(!g[fl])g[fl]=[];g[fl].push(f)})
    return g
  }

  async function handleCreate(){
    setError('')
    if(selectedFlats.length<1) return setError('Please select at least one flat.')
    const amt=parseFloat(form.maintenanceAmount)||5000
    const bal=parseFloat(form.openingBalance)||0
    setLoading(true)
    try{
      const projRef=await addDoc(collection(db,'projects'),{
        name:form.name.trim(),address:form.address.trim(),
        totalFlats:selectedFlats.length,flats:selectedFlats,
        image:img.image||'',defaultMaintenanceAmount:amt,openingBalance:bal,
        supervisorName:'',watchmanName:'',watchmanPhone:'',watchmanPhoto:'',
        createdAt:serverTimestamp(),
      })
      await setDoc(doc(db,'projects',projRef.id,'data','main'),buildInitialData(selectedFlats,amt,bal,form.name.trim()))
      onCreated(); onClose()
    }catch(err){setError('Error: '+err.message)}
    setLoading(false)
  }

  return(
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{step===1?'🏢 Add New Project':`🏠 Configure Flats — ${form.name}`}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{step===1?'Step 1 of 2 — Project details':`Step 2 of 2 — ${selectedFlats.length} flats selected`}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none">×</button>
        </div>

        {step===1&&(
          <form onSubmit={handleNext} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Project Image</label>
              <div className="flex items-center gap-3">
                <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer bg-gray-50"
                  onClick={()=>img.ref.current?.click()}>
                  {img.image?<img src={img.image} alt="p" className="w-full h-full object-cover"/>:<span className="text-3xl">🏢</span>}
                </div>
                <button type="button" onClick={()=>img.ref.current?.click()} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold">📷 {img.image?'Change':'Upload'}</button>
              </div>
              <input type="file" accept="image/*" className="hidden" ref={img.ref} onChange={e=>img.pick(e.target.files[0])}/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Building Name *</label>
              <input type="text" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Sunrise Residency"
                className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Address</label>
              <input type="text" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="e.g. 12 MG Road, Chennai"
                className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[['Floors *','floors'],['Units/Floor *','unitsPerFloor'],['Start Unit','startUnit']].map(([lbl,key])=>(
                <div key={key}>
                  <label className="block text-xs font-bold text-gray-500 mb-1">{lbl}</label>
                  <input type="number" min="1" value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
              <div>
                <label className="block text-xs font-bold text-blue-700 mb-1">Default Maintenance ₹/month</label>
                <input type="number" min="0" value={form.maintenanceAmount} onChange={e=>setForm({...form,maintenanceAmount:e.target.value})}
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm font-semibold focus:outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-blue-700 mb-1">Opening Balance ₹</label>
                <input type="number" value={form.openingBalance} onChange={e=>setForm({...form,openingBalance:e.target.value})}
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm font-semibold focus:outline-none"/>
              </div>
            </div>
            {error&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">⚠️ {error}</div>}
            <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700">Next — Configure Flats →</button>
          </form>
        )}

        {step===2&&(
          <div className="p-5 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-1">
              <p className="font-bold">How to use this grid:</p>
              <p>🟢 <strong>Click</strong> a flat to deselect it (e.g. a floor with fewer units)</p>
              <p>⬜ <strong>Click again</strong> to re-add a deselected flat</p>
              <p>✏️ <strong>Double-click</strong> any flat number to rename it</p>
            </div>

            {Object.entries(groupByFloor()).sort(([a],[b])=>parseInt(a)-parseInt(b)).map(([floor,flats])=>(
              <div key={floor}>
                <p className="text-xs font-bold text-gray-500 mb-2">
                  Floor {floor} — {flats.filter(f=>f.selected).length}/{flats.length} selected
                </p>
                <div className="flex flex-wrap gap-2">
                  {flats.sort((a,b)=>a.num-b.num).map(f=>(
                    <div key={f.num}>
                      {editingFlat===f.num?(
                        <input type="number" value={editVal} autoFocus
                          onChange={e=>setEditVal(e.target.value)}
                          onBlur={()=>commitEdit(f.num)}
                          onKeyDown={e=>{if(e.key==='Enter')commitEdit(f.num);if(e.key==='Escape')setEditingFlat(null)}}
                          className="w-16 px-2 py-1.5 border-2 border-blue-500 rounded-lg text-xs font-bold text-center focus:outline-none"/>
                      ):(
                        <button type="button" onClick={()=>toggleFlat(f.num)} onDoubleClick={()=>startEdit(f.num)}
                          title="Click to toggle · Double-click to rename"
                          className={`w-14 py-2 rounded-lg text-xs font-bold border-2 transition select-none ${
                            f.selected?'bg-green-50 border-green-400 text-green-800 hover:bg-green-100'
                            :'bg-gray-50 border-gray-300 text-gray-400 line-through hover:bg-gray-100'
                          }`}>
                          {f.num}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-600">
                ✅ {selectedFlats.length} flats selected:
                <span className="font-normal ml-1 text-gray-500">
                  {selectedFlats.slice(0,12).join(', ')}{selectedFlats.length>12?` ... +${selectedFlats.length-12} more`:''}
                </span>
              </p>
            </div>

            {error&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">⚠️ {error}</div>}

            <div className="flex gap-3">
              <button type="button" onClick={()=>setStep(1)} className="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm">← Back</button>
              <button type="button" onClick={handleCreate} disabled={loading||selectedFlats.length===0}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition">
                {loading?'Creating...':`Create Project (${selectedFlats.length} flats) →`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
// ── Edit Project Modal ────────────────────────────────────────
function EditProjectModal({proj,onClose,onSaved}) {
  const [tab,    setTab]    = useState('details') // 'details' | 'escalation'
  const [form,setForm]=useState({
    name:           proj.name||'',
    address:        proj.address||'',
    supervisorName: proj.supervisorName||'',
    supervisorPhone:proj.supervisorPhone||'',
    watchmanName:   proj.watchmanName||'',
    watchmanPhone:  proj.watchmanPhone||'',
  })
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const projImg  = useImagePicker(proj.image||'')
  const supImg   = useImagePicker(proj.supervisorPhoto||'')
  const watchImg = useImagePicker(proj.watchmanPhoto||'')

  async function handleSave(e){
    e.preventDefault(); setError('')
    setLoading(true)
    try{
      await updateDoc(doc(db,'projects',proj.id),{
        name:            form.name.trim(),
        address:         form.address.trim(),
        image:           projImg.image,
        supervisorName:  form.supervisorName.trim(),
        supervisorPhone: form.supervisorPhone.trim(),
        supervisorPhoto: supImg.image,
        watchmanName:    form.watchmanName.trim(),
        watchmanPhone:   form.watchmanPhone.trim(),
        watchmanPhoto:   watchImg.image,
      })
      onSaved(); onClose()
    }catch(err){setError('Error: '+err.message)}
    setLoading(false)
  }

  async function handleToggleActive(){
    const nowActive = proj.active !== false  // currently active
    if(nowActive && !confirmDeactivate){
      setConfirmDeactivate(true)
      return
    }
    try{
      await updateDoc(doc(db,'projects',proj.id),{active: nowActive ? false : true})
      onSaved(); onClose()
    }catch(err){setError('Error: '+err.message)}
  }

  // Reusable photo picker section
  function PhotoPicker({label,emoji,imgHook}){
    return(
      <div className="flex flex-col items-center gap-2">
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer bg-gray-50 flex-shrink-0 hover:border-purple-400 transition"
          onClick={()=>imgHook.ref.current?.click()}>
          {imgHook.image
            ?<img src={imgHook.image} alt={label} className="w-full h-full object-cover"/>
            :<span className="text-2xl">{emoji}</span>
          }
        </div>
        <button type="button" onClick={()=>imgHook.ref.current?.click()}
          className="text-xs text-purple-600 font-semibold hover:underline">
          {imgHook.image?'Change':'Upload'}
        </button>
        {imgHook.image&&<button type="button" onClick={()=>imgHook.setImage('')} className="text-xs text-red-400 hover:underline -mt-1">Remove</button>}
        <input type="file" accept="image/*" className="hidden" ref={imgHook.ref} onChange={e=>imgHook.pick(e.target.files[0])}/>
      </div>
    )
  }

  return(
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-base font-bold text-gray-800">✏️ Edit — {proj.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none">×</button>
        </div>
        {/* Tabs */}
        <div className="flex border-b">
          {[['details','🏢 Details'],['escalation','🔔 Escalation Rules']].map(([v,l])=>(
            <button key={v} type="button" onClick={()=>setTab(v)}
              className={`flex-1 py-3 text-xs font-bold transition ${tab===v?'border-b-2 border-purple-600 text-purple-700':'text-gray-500 hover:text-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Escalation tab */}
        {tab==='escalation' && (
          <div className="p-5">
            <EscalationSettings
              projectId={proj.id}
              config={{
                amberDay:       proj.escalationAmberDay  || 10,
                redDay:         proj.escalationRedDay    || 15,
                escalateMonths: proj.escalationMonths    || 2,
              }}
              onSaved={()=>{ onSaved() }}
            />
          </div>
        )}

        {/* Details tab */}
        {tab==='details' && (
        <form onSubmit={handleSave} className="p-5 space-y-4">

          {/* Project image */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2">Project Image</label>
            <div
              className="relative w-full h-36 rounded-xl overflow-hidden border-2 border-dashed border-gray-300 cursor-pointer group"
              onClick={()=>projImg.ref.current?.click()}>
              {projImg.image
                ? <img src={projImg.image} alt="project" className="w-full h-full object-cover"/>
                : <div className="w-full h-full bg-gradient-to-br from-purple-50 to-indigo-50 flex flex-col items-center justify-center gap-1">
                    <span className="text-4xl">🏢</span>
                    <span className="text-xs text-gray-400 font-semibold">Click to upload</span>
                  </div>
              }
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition flex items-center justify-center">
                <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 bg-black bg-opacity-60 px-3 py-1 rounded-full">
                  📷 Change
                </span>
              </div>
            </div>
            <input type="file" accept="image/*" className="hidden" ref={projImg.ref} onChange={e=>projImg.pick(e.target.files[0])}/>
          </div>

          {/* Name + Address */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Building Name</label>
              <input type="text" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}
                className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Address</label>
              <input type="text" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}
                className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"/>
            </div>
          </div>

          {/* Supervisor + Watchman side by side */}
          <div className="grid grid-cols-2 gap-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-600 text-center">👔 Supervisor</p>
              <div className="flex justify-center">
                <PhotoPicker label="Supervisor" emoji="👔" imgHook={supImg}/>
              </div>
              <input type="text" value={form.supervisorName} onChange={e=>setForm({...form,supervisorName:e.target.value})}
                placeholder="Name"
                className="w-full px-2 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"/>
              <input type="tel" value={form.supervisorPhone} onChange={e=>setForm({...form,supervisorPhone:e.target.value})}
                placeholder="Mobile number"
                className="w-full px-2 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"/>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-600 text-center">👷 Watchman</p>
              <div className="flex justify-center">
                <PhotoPicker label="Watchman" emoji="👷" imgHook={watchImg}/>
              </div>
              <input type="text" value={form.watchmanName} onChange={e=>setForm({...form,watchmanName:e.target.value})}
                placeholder="Name"
                className="w-full px-2 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"/>
              <input type="tel" value={form.watchmanPhone} onChange={e=>setForm({...form,watchmanPhone:e.target.value})}
                placeholder="Mobile number"
                className="w-full px-2 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"/>
            </div>
          </div>

          {/* Active toggle */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-700">Project Status</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {proj.active===false ? 'Inactive — excluded from all totals' : 'Active — included in portfolio totals'}
                </p>
              </div>
              <button type="button" onClick={handleToggleActive}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none ${
                  proj.active===false ? 'bg-gray-300' : 'bg-green-500'
                }`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  proj.active===false ? 'translate-x-1' : 'translate-x-8'
                }`}/>
              </button>
            </div>
            {confirmDeactivate && proj.active!==false && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs font-bold text-red-700 mb-1">⚠️ Confirm Deactivation</p>
                <p className="text-xs text-red-600 mb-3">
                  This project will be hidden from all totals and marked as no longer live. You can reactivate it at any time.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={handleToggleActive}
                    className="flex-1 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700">
                    Yes, Deactivate
                  </button>
                  <button type="button" onClick={()=>setConfirmDeactivate(false)}
                    className="flex-1 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">⚠️ {error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 disabled:opacity-50 transition">
              {loading ? 'Saving...' : '✓ Save Changes'}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm">
              Cancel
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}

// ── Super Admin Profile Banner ────────────────────────────────
function AdminBanner({userName,user}) {
  const [photo,setPhoto]=useState(()=>localStorage.getItem('superadmin_photo')||'')
  const imgRef=useRef()
  function handlePhoto(file){
    if(!file) return
    const reader=new FileReader()
    reader.onload=e=>{setPhoto(e.target.result);localStorage.setItem('superadmin_photo',e.target.result)}
    reader.readAsDataURL(file)
  }
  return(
    <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-900 text-white px-6 py-4 flex items-center gap-4">
      <div className="relative flex-shrink-0">
        <div className="w-14 h-14 rounded-2xl ring-2 ring-purple-400 ring-offset-2 ring-offset-purple-900 overflow-hidden bg-purple-700 flex items-center justify-center cursor-pointer"
          onClick={()=>imgRef.current?.click()}>
          {photo?<img src={photo} alt={userName} className="w-full h-full object-cover"/>
            :<span className="text-2xl font-bold">{(userName||'S')[0]?.toUpperCase()}</span>}
        </div>
        <button onClick={()=>imgRef.current?.click()}
          className="absolute -bottom-1 -right-1 w-5 h-5 bg-white text-purple-700 rounded-full text-xs flex items-center justify-center shadow font-bold">+</button>
        <input type="file" accept="image/*" className="hidden" ref={imgRef} onChange={e=>handlePhoto(e.target.files[0])}/>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 bg-purple-500 rounded-full text-xs font-bold">👑 Super Admin</span>
          <span className="text-xs text-purple-300">{user?.email}</span>
        </div>
        <p className="font-bold text-lg mt-0.5 leading-tight truncate">{userName||user?.email}</p>
      </div>
      <div className="text-right hidden md:block flex-shrink-0">
        <p className="text-xs text-purple-300 font-semibold tracking-widest uppercase">GM Property Hub</p>
        <p className="text-xs text-purple-400">GM Residential Group Management</p>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────
export default function SuperAdminDashboard() {
  const {user,role,userName,logout}=useAuth()
  const isSuperAdmin=role==='superadmin'

  const [projects,    setProjects]    = useState([])
  const [projectData, setProjectData] = useState({})
  const [selectedProj,setSelectedProj]= useState(null)
  const [showAdd,     setShowAdd]     = useState(false)
  const [showUsers,   setShowUsers]   = useState(false)
  const [editProj,    setEditProj]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [filterYear,  setFilterYear]  = useState(TODAY.getFullYear())
  const [filterMonth, setFilterMonth] = useState(TODAY.getMonth())

  async function loadProjects(){
    setLoading(true)
    try{
      const snap=await getDocs(collection(db,'projects'))
      const list=snap.docs.map(d=>({id:d.id,...d.data()}))
      setProjects(list)
      const pd={}
      await Promise.all(list.map(async proj=>{
        try{
          const dataSnap=await getDoc(doc(db,'projects',proj.id,'data','main'))
          if(dataSnap.exists()) pd[proj.id]=dataSnap.data()
        }catch(e){}
      }))
      setProjectData(pd)
    }catch(e){console.error(e)}
    setLoading(false)
  }

  useEffect(()=>{loadProjects()},[])

  const activeProjects = projects.filter(p => p.active !== false)

  const metrics={}
  activeProjects.forEach(proj=>{
    metrics[proj.id]=calcMetrics(projectData[proj.id],proj.flats||[],filterYear,filterMonth)
  })

  const totals=Object.values(metrics).reduce(
    (acc,m)=>({collected:acc.collected+m.collected,pending:acc.pending+m.pending,expenses:acc.expenses+m.expenses,flats:acc.flats+m.flatsCount}),
    {collected:0,pending:0,expenses:0,flats:0}
  )

  // ── Project detail view ───────────────────────────────────
  if(selectedProj){
    return(
      <div>
        <AdminBanner userName={userName} user={user}/>
        <div className="bg-gray-900 text-white px-4 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <button onClick={()=>setSelectedProj(null)} className="text-blue-400 hover:text-blue-300 font-semibold">← GM Property Hub</button>
            <span className="text-gray-400">|</span>
            <span className="text-white font-semibold">🏢 {selectedProj.name}</span>
            <span className="px-2 py-0.5 bg-purple-500 rounded-full font-bold">{isSuperAdmin?'👑 Super Admin':'👁️ Read Only'}</span>
          </div>
          <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded font-semibold">Sign Out</button>
        </div>
        <AppContent isAdmin={isSuperAdmin} role={isSuperAdmin?'admin':'readonly'} flatNumber={null}
          currentUser={userName||user?.email} projectId={selectedProj.id} projectFlats={selectedProj.flats}/>
      </div>
    )
  }

  // ── Portfolio overview ────────────────────────────────────
  return(
    <div className="min-h-screen bg-gray-100">
      <AdminBanner userName={userName} user={user}/>

      {/* Action bar */}
      <div className="bg-gray-900 text-white px-4 py-2 flex items-center justify-between text-xs">
        <span className="text-gray-400 font-semibold tracking-widest">GM PROPERTY HUB</span>
        <div className="flex items-center gap-2">
          {isSuperAdmin&&(
            <button onClick={()=>setShowUsers(v=>!v)}
              className={`px-3 py-1 rounded font-semibold transition ${showUsers?'bg-indigo-600':'bg-gray-600 hover:bg-gray-500'}`}>
              👥 Users
            </button>
          )}
          <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded font-semibold">Sign Out</button>
        </div>
      </div>

      {/* User Approvals */}
      {isSuperAdmin&&showUsers&&(
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-800">👥 User Management — All Projects</h2>
                <p className="text-xs text-gray-500 mt-0.5">Approve registrations across all buildings</p>
              </div>
              <button onClick={()=>setShowUsers(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none">×</button>
            </div>
            <UserApprovalsPanel/>
          </div>
        </div>
      )}

      {/* Hero header */}
      <div className="bg-gradient-to-r from-gray-900 via-purple-900 to-gray-900 text-white px-6 py-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
            <div>
              {/* Big dynamic title */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-5xl">🏢</span>
                <div>
                  <h1 className="text-5xl font-black tracking-tight leading-none">
                    GM Property Hub
                  </h1>
                  <p className="text-purple-300 text-xs font-semibold tracking-widest uppercase mt-1">
                    GM Residential Group Management
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <span className="px-3 py-1 bg-purple-500 bg-opacity-40 rounded-full text-sm font-bold text-purple-100">
                  🏗️ {activeProjects.length} Active Building{activeProjects.length!==1?'s':''}
                </span>
                <span className="px-3 py-1 bg-purple-500 bg-opacity-40 rounded-full text-sm font-bold text-purple-100">
                  🏠 {totals.flats} Total Flats
                </span>
                {projects.length-activeProjects.length>0&&(
                  <span className="px-3 py-1 bg-gray-500 bg-opacity-40 rounded-full text-sm font-bold text-gray-300">
                    {projects.length-activeProjects.length} Inactive
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Month/Year filter */}
              <div className="flex items-center gap-2 bg-white bg-opacity-10 rounded-xl px-4 py-2.5 border border-white border-opacity-10">
                <span className="text-xs text-purple-200 font-semibold">Showing:</span>
                <select value={filterMonth} onChange={e=>setFilterMonth(parseInt(e.target.value))}
                  className="bg-transparent text-white text-sm font-bold border-none outline-none cursor-pointer">
                  {MONTHS_FULL.map((m,i)=><option key={i} value={i} className="text-gray-800">{m}</option>)}
                </select>
                <select value={filterYear} onChange={e=>setFilterYear(parseInt(e.target.value))}
                  className="bg-transparent text-white text-sm font-bold border-none outline-none cursor-pointer">
                  {YEARS.map(y=><option key={y} value={y} className="text-gray-800">{y}</option>)}
                </select>
              </div>
              {isSuperAdmin&&(
                <button onClick={()=>setShowAdd(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-purple-800 rounded-xl font-bold text-sm hover:bg-purple-50 shadow-lg transition">
                  + Add New Project
                </button>
              )}
            </div>
          </div>

          {/* Portfolio totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ["🏗️ Active Projects", activeProjects.length,                     "text-white"],
              ["💰 Collected",       "₹"+totals.collected.toLocaleString(), "text-emerald-300"],
              ["⏳ Pending",         "₹"+totals.pending.toLocaleString(),   "text-orange-300"],
              ["📤 Expenses",        "₹"+totals.expenses.toLocaleString(),  "text-red-300"],
            ].map(([label,value,color])=>(
              <div key={label} className="bg-white bg-opacity-10 rounded-xl p-4 backdrop-blur border border-white border-opacity-10">
                <p className="text-xs text-purple-200 font-semibold">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                <p className="text-xs text-purple-300 mt-1">{MONTHS_FULL[filterMonth]} {filterYear}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Project cards */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {loading&&(
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"/>
          </div>
        )}
        {!loading&&projects.length===0&&(
          <div className="text-center py-16 text-gray-400">
            <p className="text-6xl mb-4">🏢</p>
            <p className="text-xl font-semibold text-gray-500">No projects yet</p>
            {isSuperAdmin&&(
              <button onClick={()=>setShowAdd(true)}
                className="mt-4 px-6 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition">
                + Add Your First Project
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {projects.map(proj=>{
            const isActive = proj.active !== false
            const m=isActive?(metrics[proj.id]||{collected:0,pending:0,expenses:0,flatsCount:proj.totalFlats||0}):{collected:0,pending:0,expenses:0,flatsCount:proj.totalFlats||0}
            const occ=calcOccupancy(projectData[proj.id],proj.flats||[])
            const collectionRate=isActive&&(m.collected+m.pending>0)?Math.round(m.collected/(m.collected+m.pending)*100):0

            return(
              <div key={proj.id}
                className={`bg-white rounded-2xl shadow-sm border transition flex flex-col overflow-hidden group ${
                  isActive
                    ? 'border-gray-100 hover:shadow-xl hover:border-purple-200'
                    : 'border-gray-200 opacity-60 grayscale'
                }`}
              >
                {/* Inactive ribbon */}
                {!isActive&&(
                  <div className="bg-gray-700 text-white text-xs font-bold text-center py-1.5 tracking-widest">
                    ⛔ PROJECT INACTIVE — NOT COUNTED IN TOTALS
                  </div>
                )}

                {/* Image */}
                <div className="relative w-full h-44 cursor-pointer" onClick={()=>isActive&&setSelectedProj(proj)}>
                  {proj.image
                    ?<img src={proj.image} alt={proj.name} className="w-full h-full object-cover"/>
                    :<div className="w-full h-full bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center">
                      <span className="text-6xl">🏢</span>
                    </div>
                  }
                  {isSuperAdmin&&(
                    <button onClick={e=>{e.stopPropagation();setEditProj(proj)}}
                      className="absolute top-2 right-2 bg-black bg-opacity-60 hover:bg-opacity-80 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition opacity-0 group-hover:opacity-100">
                      ✏️ Edit
                    </button>
                  )}
                  {isActive&&(
                    <span className={`absolute bottom-2 right-2 text-xs font-bold px-2.5 py-1 rounded-full ${
                      collectionRate>=80?'bg-green-500 text-white':collectionRate>=50?'bg-yellow-400 text-gray-900':'bg-red-500 text-white'
                    }`}>
                      {collectionRate>=80?'✅ On Track':collectionRate>=50?'⚠️ Partial':'🔴 Low'}
                    </span>
                  )}
                </div>

                {/* Card body */}
                <div className="p-5 flex-1 cursor-pointer" onClick={()=>isActive&&setSelectedProj(proj)}>

                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h2 className="font-bold text-gray-800 text-lg leading-tight">{proj.name}</h2>
                      {proj.address&&<p className="text-xs text-gray-400 mt-0.5">📍 {proj.address}</p>}
                    </div>
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ml-2">
                      {proj.totalFlats||(proj.flats||[]).length} flats
                    </span>
                  </div>

                  {/* Occupancy */}
                  <div className="grid grid-cols-4 gap-1.5 mb-4">
                    {[
                      ["🏠",occ.total,       "Total",  "bg-gray-50 text-gray-700"],
                      ["👤",occ.ownerOccupied,"Owners", "bg-blue-50 text-blue-700"],
                      ["🧑‍💼",occ.tenants,  "Tenants","bg-green-50 text-green-700"],
                      ["🔑",occ.vacant,      "Vacant", "bg-red-50 text-red-600"],
                    ].map(([icon,count,label,cls])=>(
                      <div key={label} className={`${cls} rounded-lg p-2 text-center`}>
                        <p className="text-xs">{icon}</p>
                        <p className="text-sm font-bold leading-tight">{count}</p>
                        <p className="text-xs leading-tight opacity-70">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Financials — only for active projects */}
                  {isActive&&(<>
                    <p className="text-xs font-bold text-gray-400 uppercase mb-2">{MONTHS_FULL[filterMonth]} {filterYear}</p>
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Collection rate</span>
                        <span className="font-bold text-emerald-600">{collectionRate}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{width:collectionRate+'%'}}/>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-4">
                      <div className="bg-emerald-50 rounded-lg p-2">
                        <p className="text-xs font-bold text-emerald-700">₹{m.collected.toLocaleString()}</p>
                        <p className="text-xs text-emerald-500">Collected</p>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-2">
                        <p className="text-xs font-bold text-orange-600">₹{m.pending.toLocaleString()}</p>
                        <p className="text-xs text-orange-400">Pending</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-2">
                        <p className="text-xs font-bold text-red-600">₹{m.expenses.toLocaleString()}</p>
                        <p className="text-xs text-red-400">Expenses</p>
                      </div>
                    </div>
                  </>)}

                  {/* Supervisor + Watchman side by side */}
                  {(proj.supervisorName||proj.watchmanName)&&(
                    <div className="border-t border-gray-100 pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        {/* Supervisor */}
                        {proj.supervisorName&&(
                          <div className="flex items-center gap-2">
                            {proj.supervisorPhoto
                              ?<img src={proj.supervisorPhoto} alt={proj.supervisorName} className="w-9 h-9 rounded-full object-cover ring-2 ring-gray-200 flex-shrink-0"/>
                              :<div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-base">👔</div>
                            }
                            <div className="min-w-0">
                              <p className="text-xs text-gray-400 leading-none">Supervisor</p>
                              <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{proj.supervisorName}</p>
                              {proj.supervisorPhone&&(
                                <a href={`tel:${proj.supervisorPhone}`} onClick={e=>e.stopPropagation()}
                                  className="text-xs text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5">
                                  📞 {proj.supervisorPhone}
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                        {/* Watchman */}
                        {proj.watchmanName&&(
                          <div className="flex items-center gap-2">
                            {proj.watchmanPhoto
                              ?<img src={proj.watchmanPhoto} alt={proj.watchmanName} className="w-9 h-9 rounded-full object-cover ring-2 ring-gray-200 flex-shrink-0"/>
                              :<div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 text-base">👷</div>
                            }
                            <div className="min-w-0">
                              <p className="text-xs text-gray-400 leading-none">Watchman</p>
                              <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{proj.watchmanName}</p>
                              {proj.watchmanPhone&&(
                                <a href={`tel:${proj.watchmanPhone}`} onClick={e=>e.stopPropagation()}
                                  className="text-xs text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5">
                                  📞 {proj.watchmanPhone}
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {isSuperAdmin&&!proj.supervisorName&&!proj.watchmanName&&isActive&&(
                    <div className="border-t border-gray-100 pt-3">
                      <button onClick={e=>{e.stopPropagation();setEditProj(proj)}}
                        className="text-xs text-purple-500 hover:underline font-semibold">
                        + Add supervisor &amp; watchman details
                      </button>
                    </div>
                  )}
                </div>

                <div className="px-5 py-3 border-t border-gray-50 bg-gray-50 flex justify-between items-center">
                  <span className="text-xs text-gray-400">
                    {isActive?'Click to manage →':'Inactive project'}
                  </span>
                  {isSuperAdmin&&(
                    <button onClick={e=>{e.stopPropagation();setEditProj(proj)}}
                      className="text-xs text-purple-600 font-semibold hover:underline">✏️ Edit</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showAdd&&isSuperAdmin&&<AddProjectModal onClose={()=>setShowAdd(false)} onCreated={loadProjects}/>}
      {editProj&&isSuperAdmin&&(
        <EditProjectModal
          proj={editProj}
          onClose={()=>setEditProj(null)}
          onSaved={()=>{setEditProj(null);loadProjects()}}
        />
      )}
    </div>
  )
}
