import { useState, useMemo, useRef, useEffect } from "react";
import { doc, getDoc, setDoc, collection, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Home, Plus, Trash2, Edit2, Share2, Download, Settings, Upload, CreditCard, ExternalLink, ChevronDown, ChevronUp, MessageSquare, Bell, Wrench, User, AlertCircle, CheckCircle, Clock, Phone, Mail, Building, Tag, Send, Filter, X } from "lucide-react";
import { LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, BarChart, Bar } from "recharts";
import { useEscalation } from "../hooks/useEscalation";
import EscalationPanel   from "./EscalationPanel";



// NOTE: FLATS is intentionally not defined globally here.
// It is computed dynamically inside AppContent from loaded project data
// and passed as a prop to all sub-page components.
// DO NOT add a hardcoded FLATS array here.
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const COLORS = ["#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#6366f1"];
const YEARS = Array.from({length:15}, (_,i) => 2026+i);
const TODAY = new Date();
const START_YEAR = 2026;

const TASK_STATUSES = ["Not Started","In Progress","Completed","Blocked","Deferred"];
const STATUS_STYLE = {
  "Not Started":  { bg:"bg-gray-100",   text:"text-gray-600",   border:"border-gray-300",  icon:"⚪" },
  "In Progress":  { bg:"bg-blue-100",   text:"text-blue-700",   border:"border-blue-300",  icon:"🔵" },
  "Completed":    { bg:"bg-green-100",  text:"text-green-700",  border:"border-green-300", icon:"✅" },
  "Blocked":      { bg:"bg-red-100",    text:"text-red-700",    border:"border-red-300",   icon:"🔴" },
  "Deferred":     { bg:"bg-yellow-100", text:"text-yellow-700", border:"border-yellow-300",icon:"⏸️" },
};
const PRIORITY_STYLE = { "High":"text-red-600 font-bold", "Medium":"text-yellow-600 font-semibold", "Low":"text-green-600" };
const INCIDENT_SEVERITIES = ["Low","Medium","High","Critical"];
const SEV_COLORS = {"Low":"bg-green-100 text-green-700 border-green-300","Medium":"bg-yellow-100 text-yellow-700 border-yellow-300","High":"bg-orange-100 text-orange-700 border-orange-300","Critical":"bg-red-100 text-red-700 border-red-300"};
const PAYMENT_METHODS = ["Cash","UPI / GPay","NEFT / IMPS","Cheque","Bank Transfer","Other"];
const DEFAULT_CATEGORIES = {
  "Salary": ["Watchman Salary"],
  "Utility – Electricity": ["EB Motor","EB Sump Motor","EB Lift"],
  "Repair & Maintenance": ["Motor Repair","Lift Repair"],
  "Water System Maintenance": ["Bore / Pump Repair"],
  "Contracted Services (AMC)": ["Lift AMC / Annual Service Charges"],
  "Operational Expenses": ["Cleaning Charges / Sweeper Payment"],
  "Administrative & Misc": ["Stationery / Bank Charges / Miscellaneous"],
};
const CSV_HEADERS = ["flat_number","occupied_by","owner_name","owner_phone","owner_alt_name","owner_alt_phone","owner_alt_relation","owner_email","owner_staying_since","owner_adults","owner_kids","tenant_name","tenant_phone","tenant_email","tenant_move_in_date","tenant_permanent_address","tenant_adults","tenant_children","tenant_id_type","tenant_id_number","tenant_emergency_contact","tenant_emergency_relation"];
const CSV_SAMPLES = [
  [101,"Owner","Rajesh Kumar","9876543210","Priya Kumar","9876543211","Spouse","rajesh@email.com","15/01/2026",2,1,"","","","","",0,0,"","","",""],
  [102,"Tenant","Suresh Sharma","9876543220","","","","suresh@email.com","",0,0,"Arun Verma","9876543230","arun@email.com","01/06/2026","12 MG Road",2,1,"Aadhaar","1234-5678-9012","Vikram","9876543231"],
];

function emptyTenant(){return{name:"",phone:"",email:"",moveInDate:new Date().toISOString().split("T")[0],permanentAddress:"",adults:1,children:0,emergencyContact:"",emergencyRelation:"",idType:"",idNumber:""}}
function parseDate(str){if(!str) return "";str=str.trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(str)){const p=str.split("/");return p[2]+"-"+p[1]+"-"+p[0];}return str;}
function fmtIndian(iso){if(!iso) return "";const d=new Date(iso);if(isNaN(d)) return iso;return d.toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"});}
function isPast(y,m){return y<TODAY.getFullYear()||(y===TODAY.getFullYear()&&m<TODAY.getMonth());}
function isCurrent(y,m){return y===TODAY.getFullYear()&&m===TODAY.getMonth();}
function isFuture(y,m){return !isPast(y,m)&&!isCurrent(y,m);}
function applyExpFilter(entries,filter){
  if(filter==="all") return entries;
  const now=new Date();
  if(filter==="3m"){const c=new Date(now.getFullYear(),now.getMonth()-2,1);return entries.filter(e=>new Date(e.year,e.month,1)>=c);}
  if(filter==="6m"){const c=new Date(now.getFullYear(),now.getMonth()-5,1);return entries.filter(e=>new Date(e.year,e.month,1)>=c);}
  if(filter==="1y"){const c=new Date(now.getFullYear(),now.getMonth()-11,1);return entries.filter(e=>new Date(e.year,e.month,1)>=c);}
  if(filter==="lastyear"){const ly=now.getFullYear()-1;return entries.filter(e=>e.year===ly);}
  const yr=parseInt(filter);if(!isNaN(yr)) return entries.filter(e=>e.year===yr);
  return entries;
}
function initData(flatsList){
  // Use provided list, or fall back to the default 22-flat building
  const F = (flatsList && flatsList.length > 0)
    ? flatsList
    : [101,102,103,104,201,202,203,204,301,302,303,304,401,402,403,404,501,502,503,504,601,602];
  return{
    flats:F.reduce((acc,num)=>({...acc,[num]:{ownerName:"Owner "+num,ownerPhone:"9999999999",ownerEmail:"",ownerAltName:"",ownerAltPhone:"",ownerAltRelation:"",ownerStayingSince:"",ownerAdults:1,ownerKids:0,previousOwners:[],ownerOccupied:false,currentTenant:null,tenantHistory:[]}}),{}),
    collections:F.reduce((acc,num)=>{const months={};YEARS.forEach(y=>MONTHS.forEach((_,i)=>{months[y+"-"+i]={amount:0,paid:false,advance:false};}));return{...acc,[num]:months};},{}),
    paymentLedger:F.reduce((acc,num)=>({...acc,[num]:[]}),{}),
    specialCollections:[],
    expenseCategories:JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    expenses:[],meetings:[],incidents:[],watchmanLeaves:[],
    building:{name:"New Project",totalFlats:F.length,shareCode:"APT"+Math.random().toString(36).substring(2,8).toUpperCase()},
    auditedPeriods:[],
    managingCommittee:[],
    watchman:{name:"",phone:"",photo:"",joiningDate:"",emergencyContact:"",address:"",spouseName:"",children:[],notes:""},
    pastWatchmen:[]
  };
}

function NavBar({view,setView,role="admin"}){
  const adminItems=[["dashboard","📊 Dashboard"],["escalation","🔔 Arrears"],["collections","💰 Collections"],["special","🎯 Special"],["expenses","📈 Expenses"],["meetings","📋 Meetings"],["incidents","🚨 Incidents"],["watchman","👷 Watchman"],["audit","📋 Audit"],["complaints","🎫 Complaints"],["vendors","🔧 Vendors"],["notifications","📱 Notify"]];
  // Residents only see their flat, payment history, complaints and meetings
  const residentItems=[["resident","🏠 My Flat"],["complaints","🎫 My Complaints"],["meetings","📋 Notices"]];
  const items=role==="resident"?residentItems:adminItems;
  return(
    <nav className="bg-white shadow sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex gap-0 overflow-x-auto">
        {items.map(([v,label])=>(
          <button key={v} onClick={()=>setView(v)} className={"px-3 py-3 border-b-2 font-semibold text-xs whitespace-nowrap "+(view===v?"border-blue-600 text-blue-600":"border-transparent text-gray-600 hover:text-gray-800")}>{label}</button>
        ))}
      </div>
    </nav>
  );
}
function MetricCard({label,value,sub,bg,onClick,borderColor}){
  return(
    <div onClick={onClick} className={bg+" rounded-lg p-4 border-l-4 "+(borderColor||"border-blue-500")+" shadow "+(onClick?"cursor-pointer hover:shadow-md transition":"")}>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
      {sub&&<p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      {onClick&&<p className="text-xs text-blue-500 mt-1 font-semibold">View →</p>}
    </div>
  );
}

// ── Confirmation Modal (reusable) ────────────────────────
function ConfirmModal({title,message,subMessage,onConfirm,onCancel,confirmLabel="Confirm",confirmClass="bg-blue-600 hover:bg-blue-700"}){
  return(
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex items-center justify-center px-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e=>e.stopPropagation()}>
        <div className="text-center mb-4"><span className="text-4xl">⚠️</span></div>
        <h2 className="text-lg font-bold text-gray-800 text-center mb-1">{title}</h2>
        <p className="text-sm text-gray-600 text-center mb-1">{message}</p>
        {subMessage&&<p className="text-xs text-gray-400 text-center mb-5">{subMessage}</p>}
        <div className="flex gap-3 mt-5">
          <button onClick={onConfirm} className={"flex-1 py-2.5 text-white rounded-xl font-bold text-sm "+confirmClass}>{confirmLabel}</button>
          <button onClick={onCancel} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-300">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── New Notice Alert (blinking badge for notices in last 10 days) ──
function NewNoticeAlert({data}){
  const [dismissed,setDismissed]=useState(false);
  const tenDaysAgo=new Date(Date.now()-10*24*60*60*1000);
  const recentMeetings=(data.meetings||[]).filter(m=>{
    const d=new Date(m.date||m.createdAt||"");
    return d>=tenDaysAgo;
  });
  const count=recentMeetings.length;
  if(count===0||dismissed) return null;
  return(
    <div className="fixed bottom-24 right-4 z-50">
      <button onClick={()=>setDismissed(true)} className="group relative flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-4 py-2.5 rounded-full shadow-2xl font-semibold text-sm animate-bounce hover:animate-none hover:shadow-indigo-300 transition-all">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-400"></span>
        </span>
        🔔 {count} new notice{count>1?"s":""} this week
        <span className="ml-1 text-gray-200 text-xs group-hover:text-white">✕</span>
      </button>
    </div>
  );
}

// ── Managing Committee Strip (bottom horizontal scroll) ────
function CommitteeBanner({members,isAdmin,onUpdate}){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(members||[]);
  const imgRef=useRef({});

  function addMember(){setDraft(d=>[...d,{id:Date.now().toString(),name:"",title:"",photo:""}]);}
  function removeMember(id){setDraft(d=>d.filter(m=>m.id!==id));}
  function updateMember(id,field,val){setDraft(d=>d.map(m=>m.id===id?{...m,[field]:val}:m));}
  function handlePhoto(id,file){
    if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>updateMember(id,"photo",e.target.result);
    reader.readAsDataURL(file);
  }
  function save(){onUpdate(draft);setEditing(false);}

  if((!members||members.length===0)&&!editing&&!isAdmin) return null;

  return(
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white border-t border-slate-700">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-xs">★</span>
            <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">Managing Committee</h2>
            <span className="text-yellow-400 text-xs">★</span>
          </div>
          {isAdmin&&!editing&&<button onClick={()=>{setDraft(members||[]);setEditing(true);}} className="text-xs px-2 py-0.5 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-full text-slate-300 border border-slate-600 transition">✏️ Edit</button>}
        </div>

        {!editing&&(members&&members.length>0?(
          <div className="flex gap-5 overflow-x-auto pb-1 scrollbar-hide" style={{scrollbarWidth:"none"}}>
            {members.map(m=>(
              <div key={m.id} className="flex items-center gap-2.5 flex-shrink-0">
                <div className="w-10 h-10 rounded-full ring-2 ring-yellow-400 ring-offset-1 ring-offset-slate-800 overflow-hidden bg-slate-700 flex items-center justify-center shadow-md flex-shrink-0">
                  {m.photo?<img src={m.photo} alt={m.name} className="w-full h-full object-cover"/>:<span className="text-base font-bold text-white">{(m.name||"?")[0]?.toUpperCase()}</span>}
                </div>
                <div>
                  <p className="text-xs font-bold text-white leading-tight whitespace-nowrap">{m.name||"—"}</p>
                  <p className="text-xs text-yellow-400 font-medium whitespace-nowrap">{m.title||""}</p>
                </div>
              </div>
            ))}
          </div>
        ):(
          isAdmin&&<div className="text-center py-2"><button onClick={()=>{setDraft([]);setEditing(true);}} className="text-xs px-4 py-1.5 bg-yellow-500 text-gray-900 font-bold rounded-full hover:bg-yellow-400 transition">+ Add Committee Members</button></div>
        ))}

        {editing&&isAdmin&&(
          <div className="bg-white bg-opacity-5 rounded-xl p-4 border border-white border-opacity-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {draft.map(m=>(
                <div key={m.id} className="bg-white bg-opacity-10 rounded-xl p-3 flex gap-3 items-start">
                  <div className="flex-shrink-0">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-blue-700 flex items-center justify-center ring-2 ring-yellow-400 cursor-pointer" onClick={()=>imgRef.current[m.id]?.click()}>
                      {m.photo?<img src={m.photo} alt="" className="w-full h-full object-cover"/>:<span className="text-xl font-bold text-white">{(m.name||"?")[0]?.toUpperCase()}</span>}
                    </div>
                    <input type="file" accept="image/*" className="hidden" ref={el=>imgRef.current[m.id]=el} onChange={e=>handlePhoto(m.id,e.target.files[0])}/>
                    <button onClick={()=>imgRef.current[m.id]?.click()} className="text-xs text-blue-300 mt-1 hover:text-white w-full text-center">📷 Photo</button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <input type="text" value={m.name} onChange={e=>updateMember(m.id,"name",e.target.value)} placeholder="Full Name *" className="w-full px-2 py-1.5 rounded-lg text-gray-800 text-sm font-semibold"/>
                    <input type="text" value={m.title} onChange={e=>updateMember(m.id,"title",e.target.value)} placeholder="Title (e.g. President)" className="w-full px-2 py-1.5 rounded-lg text-gray-800 text-sm"/>
                    <button onClick={()=>removeMember(m.id)} className="text-xs text-red-300 hover:text-red-100">✕ Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={addMember} className="px-4 py-2 bg-yellow-500 text-gray-900 font-bold rounded-lg text-sm hover:bg-yellow-400">+ Add Member</button>
              <button onClick={save} className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg text-sm hover:bg-green-400">✓ Save</button>
              <button onClick={()=>setEditing(false)} className="px-4 py-2 bg-white bg-opacity-10 text-white rounded-lg text-sm hover:bg-opacity-20">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function YMSel({currentYear,setCurrentYear,currentMonth,setCurrentMonth}){
  return(
    <div className="flex gap-2 items-center">
      <select value={currentYear} onChange={e=>setCurrentYear(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg text-sm font-semibold">{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>
      <select value={currentMonth} onChange={e=>setCurrentMonth(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg text-sm font-semibold">{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
    </div>
  );
}
function StatusBadge({status}){
  if(status==="owner") return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Owner</span>;
  if(status==="tenant") return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">Tenant</span>;
  return <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">Vacant</span>;
}
function ExpFilterBar({filter,setFilter,entries}){
  const yrs=[...new Set(entries.map(e=>e.year))].sort();
  const opts=[["all","All Time"],["3m","Last 3M"],["6m","Last 6M"],["1y","Last 1Y"],["lastyear","Last Cal. Year"],...yrs.map(y=>[String(y),String(y)])];
  return(
    <div className="flex flex-wrap gap-2 items-center bg-white rounded-lg shadow px-4 py-3">
      <span className="text-xs font-bold text-gray-500 mr-1">FILTER:</span>
      {opts.map(([val,lbl])=>(<button key={val} onClick={()=>setFilter(val)} className={"px-3 py-1.5 rounded-lg text-xs font-bold border transition "+(filter===val?"bg-blue-600 text-white border-blue-600":"border-gray-300 text-gray-600 hover:bg-gray-50")}>{lbl}</button>))}
    </div>
  );
}

function RecordPaymentModal({paymentFlat,flatData,collections,onClose,onSubmit,isAdmin}){
  const [form,setForm]=useState({date:TODAY.toISOString().split("T")[0],amount:"",method:"Cash",receivedFrom:"",comments:"",selectedMonths:[]});
  function getCol(y,m){return(collections[paymentFlat]&&collections[paymentFlat][y+"-"+m])||{amount:5000,paid:false,advance:false};}
  const unpaid=[];
  YEARS.forEach(y=>MONTHS.forEach((_,m)=>{const c=getCol(y,m);if(!c.paid) unpaid.push({year:y,month:m,key:y+"-"+m,amount:c.amount,future:isFuture(y,m)});}));
  const shown=unpaid.slice(0,36);
  function toggleMonth(key,year,month){setForm(f=>{const ex=f.selectedMonths.find(s=>s.key===key);return{...f,selectedMonths:ex?f.selectedMonths.filter(s=>s.key!==key):[...f.selectedMonths,{key,year,month}]};});}
  const selTotal=form.selectedMonths.reduce((s,m)=>s+getCol(m.year,m.month).amount,0);
  const diff=parseFloat(form.amount||0)-selTotal;
  const name=flatData.currentTenant?flatData.currentTenant.name:flatData.ownerName;
  return(
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-start justify-center pt-4 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white rounded-t-2xl">
          <div><h2 className="text-lg font-bold text-gray-800">💳 Record Payment — Flat {paymentFlat}</h2><p className="text-xs text-gray-500">{name}</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Received Date *</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} disabled={!isAdmin} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Amount (₹) *</label><input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} disabled={!isAdmin} placeholder="e.g. 5000" className="w-full px-3 py-2 border rounded-lg text-sm font-semibold"/></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Received Mode</label><select value={form.method} onChange={e=>setForm({...form,method:e.target.value})} disabled={!isAdmin} className="w-full px-3 py-2 border rounded-lg text-sm">{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Received From</label><input type="text" value={form.receivedFrom} onChange={e=>setForm({...form,receivedFrom:e.target.value})} disabled={!isAdmin} placeholder="Name / UPI ref..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            <div className="col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Comments</label><input type="text" value={form.comments} onChange={e=>setForm({...form,comments:e.target.value})} disabled={!isAdmin} placeholder="Any additional notes..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">SELECT MONTHS THIS PAYMENT COVERS</p>
            {shown.length===0?<p className="text-sm text-green-600 font-semibold bg-green-50 p-3 rounded-lg">✅ No pending months!</p>:(
              <div className="grid grid-cols-4 gap-2">
                {shown.map(m=>{const sel=form.selectedMonths.find(s=>s.key===m.key);return(
                  <button key={m.key} onClick={()=>isAdmin&&toggleMonth(m.key,m.year,m.month)} disabled={!isAdmin} className={"rounded-lg px-2 py-2 text-xs font-bold border-2 transition text-center "+(sel?"border-green-500 bg-green-100 text-green-700":m.future?"border-purple-300 bg-purple-50 text-purple-600":"border-orange-300 bg-orange-50 text-orange-700")}>
                    <p>{MONTHS[m.month]} {m.year}</p><p className="font-normal mt-0.5">₹{m.amount.toLocaleString()}</p>
                    {m.future&&<p className="text-purple-500 font-semibold mt-0.5">Advance</p>}
                  </button>
                );})}
              </div>
            )}
          </div>
          {form.selectedMonths.length>0&&(
            <div className={"rounded-xl p-4 border-2 "+(diff===0?"bg-green-50 border-green-300":diff>0?"bg-blue-50 border-blue-300":"bg-red-50 border-red-300")}>
              <div className="flex justify-between text-sm font-semibold"><span>Amount Received:</span><span>₹{parseFloat(form.amount||0).toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span>Months Selected ({form.selectedMonths.length}):</span><span>₹{selTotal.toLocaleString()}</span></div>
              <div className={"flex justify-between text-sm font-bold mt-1 pt-1 border-t "+(diff===0?"text-green-700":diff>0?"text-blue-700":"text-red-700")}>
                <span>{diff===0?"✅ Exact match":diff>0?"💰 Advance: ₹"+diff.toLocaleString():"⚠️ Short: ₹"+Math.abs(diff).toLocaleString()}</span>
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            {isAdmin&&<button onClick={()=>onSubmit(form)} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 text-sm">✓ Confirm Payment</button>}
            <button onClick={onClose} className="px-6 py-2.5 bg-gray-400 text-white rounded-lg font-bold text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryManager({cats,onClose,onAddCat,onDeleteCat,onRenameCat,onAddSub,onDeleteSub,onRenameSub,isAdmin}){
  const [newCat,setNewCat]=useState("");const [newSub,setNewSub]=useState({});const [editCat,setEditCat]=useState(null);const [editSub,setEditSub]=useState(null);
  return(
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-10 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white"><h2 className="text-xl font-bold">⚙️ Manage Categories</h2><button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">×</button></div>
        <div className="p-6 space-y-5">
          {isAdmin&&(
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-xs font-bold text-blue-700 mb-2">ADD NEW CATEGORY</p>
              <div className="flex gap-2"><input type="text" value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){onAddCat(newCat);setNewCat("");}}} placeholder="Category name..." className="flex-1 px-3 py-2 border rounded-lg text-sm"/><button onClick={()=>{onAddCat(newCat);setNewCat("");}} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Add</button></div>
            </div>
          )}
          {Object.keys(cats).map(cat=>(
            <div key={cat} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between bg-gray-100 px-4 py-3">
                {isAdmin&&editCat===cat?(<div className="flex gap-2 flex-1"><input type="text" defaultValue={cat} id={"ec-"+cat} className="flex-1 px-2 py-1 border rounded text-sm font-semibold" autoFocus/><button onClick={()=>{const el=document.getElementById("ec-"+cat);onRenameCat(cat,el.value);setEditCat(null);}} className="px-3 py-1 bg-green-600 text-white rounded text-xs font-bold">Save</button><button onClick={()=>setEditCat(null)} className="px-3 py-1 bg-gray-400 text-white rounded text-xs font-bold">Cancel</button></div>):<span className="font-bold text-gray-800">{cat}</span>}
                {isAdmin&&<div className="flex gap-2 ml-3">{!editCat&&<button onClick={()=>setEditCat(cat)} className="text-blue-500 hover:text-blue-700 p-1"><Edit2 size={14}/></button>}<button onClick={()=>onDeleteCat(cat)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14}/></button></div>}
              </div>
              <div className="p-3 space-y-2">
                {cats[cat].map(sub=>(<div key={sub} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                  {isAdmin&&editSub&&editSub.cat===cat&&editSub.sub===sub?(<div className="flex gap-2 flex-1"><input type="text" defaultValue={sub} id={"es-"+cat+sub} className="flex-1 px-2 py-1 border rounded text-sm" autoFocus/><button onClick={()=>{const el=document.getElementById("es-"+cat+sub);onRenameSub(cat,sub,el.value);setEditSub(null);}} className="px-2 py-1 bg-green-600 text-white rounded text-xs font-bold">Save</button><button onClick={()=>setEditSub(null)} className="px-2 py-1 bg-gray-400 text-white rounded text-xs font-bold">Cancel</button></div>):<span className="text-sm text-gray-700">• {sub}</span>}
                  {isAdmin&&<div className="flex gap-2 ml-2">{!editSub&&<button onClick={()=>setEditSub({cat,sub})} className="text-blue-400 hover:text-blue-600 p-1"><Edit2 size={12}/></button>}<button onClick={()=>onDeleteSub(cat,sub)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={12}/></button></div>}
                </div>))}
                {isAdmin&&<div className="flex gap-2 mt-2"><input type="text" value={newSub[cat]||""} onChange={e=>setNewSub({...newSub,[cat]:e.target.value})} onKeyDown={e=>{if(e.key==="Enter"){onAddSub(cat,newSub[cat]||"");setNewSub({...newSub,[cat]:""});}}} placeholder="Add sub-category..." className="flex-1 px-3 py-1.5 border rounded text-sm bg-white"/><button onClick={()=>{onAddSub(cat,newSub[cat]||"");setNewSub({...newSub,[cat]:""});}} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700">+ Add</button></div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CsvModal({onClose,onImport,isAdmin}){
  const [preview,setPreview]=useState(null);const [errors,setErrors]=useState([]);const fileRef=useRef(null);
  const csvText=[CSV_HEADERS].concat(CSV_SAMPLES.map(r=>r.map(c=>'"'+String(c)+'"'))).map(r=>r.join(",")).join("\n");
  function parseFile(file){const reader=new FileReader();reader.onload=e=>{try{const text=e.target.result;const lines=text.trim().split("\n").map(l=>l.trim());const headers=lines[0].split(",").map(h=>h.replace(/^"|"$/g,"").trim().toLowerCase());const rows=lines.slice(1).map(line=>{const vals=[];let cur="",inQ=false;for(let i=0;i<line.length;i++){if(line[i]==='"'){inQ=!inQ;}else if(line[i]===","&&!inQ){vals.push(cur.trim());cur="";}else cur+=line[i];}vals.push(cur.trim());const obj={};headers.forEach((h,i)=>{obj[h]=(vals[i]||"").replace(/^"|"$/g,"").trim();});return obj;}).filter(r=>r["flat_number"]);const errs=[],prev=[];rows.forEach((row,idx)=>{const fn=parseInt(row["flat_number"]);const occ=(row["occupied_by"]||"").toLowerCase();if(!["owner","tenant","vacant"].includes(occ)){errs.push("Row "+(idx+2)+": occupied_by must be Owner/Tenant/Vacant.");return;}prev.push({flatNum:fn,occ,row});});setErrors(errs);setPreview(prev);}catch(err){setErrors(["Parse error: "+err.message]);setPreview(null);}};reader.readAsText(file);}
  return(
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-start justify-center pt-8 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white rounded-t-2xl"><h2 className="text-xl font-bold">📥 Bulk Import via CSV</h2><button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">×</button></div>
        <div className="p-6 space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4"><p className="text-sm font-bold text-blue-700 mb-2">Step 1 — Copy the CSV Template</p><textarea readOnly value={csvText} rows={5} onClick={e=>e.target.select()} className="w-full text-xs font-mono bg-white border-2 border-blue-300 rounded-lg p-3 resize-y text-gray-700"/></div>
          {isAdmin&&<div className="bg-green-50 border border-green-200 rounded-xl p-4"><p className="text-sm font-bold text-green-700 mb-2">Step 2 — Upload Filled CSV</p><input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e=>{if(e.target.files[0]) parseFile(e.target.files[0]);}}/><button onClick={()=>fileRef.current.click()} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"><Upload size={15}/> Choose CSV File</button></div>}
          {errors.length>0&&<div className="bg-red-50 border border-red-200 rounded-xl p-4"><p className="text-sm font-bold text-red-700 mb-2">⚠️ Errors</p>{errors.map((e,i)=><p key={i} className="text-xs text-red-600">• {e}</p>)}</div>}
          {preview&&preview.length>0&&(<div><p className="text-sm font-bold text-gray-700 mb-2">Preview — {preview.length} rows</p><div className="overflow-x-auto rounded-xl border"><table className="w-full text-xs"><thead className="bg-gray-100"><tr><th className="px-3 py-2 text-left">Flat</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Owner</th><th className="px-3 py-2 text-left">Tenant</th></tr></thead><tbody>{preview.map(item=>(<tr key={item.flatNum} className="border-t hover:bg-gray-50"><td className="px-3 py-2 font-bold text-blue-600">{item.flatNum}</td><td className="px-3 py-2"><StatusBadge status={item.occ==="owner"?"owner":item.occ==="tenant"?"tenant":"vacant"}/></td><td className="px-3 py-2">{item.row["owner_name"]||"—"}</td><td className="px-3 py-2">{item.occ==="tenant"?(item.row["tenant_name"]||"—"):"—"}</td></tr>))}</tbody></table></div>{isAdmin&&<div className="flex gap-3 mt-4"><button onClick={()=>onImport(preview)} className="px-5 py-2 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700">✅ Confirm & Import {preview.length} Flats</button><button onClick={()=>{setPreview(null);setErrors([]);}} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Clear</button></div>}</div>)}
        </div>
      </div>
    </div>
  );
}

function ExpDetailView({title,subtitle,allEntries,onBack,navView,setView,role="admin"}){
  const [filter,setFilter]=useState("all");
  const filtered=applyExpFilter(allEntries,filter);
  const total=filtered.reduce((s,e)=>s+e.amount,0);
  const avg=filtered.length?Math.round(total/filtered.length):0;
  const trendMap={};filtered.forEach(e=>{const k=e.year+"-"+String(e.month).padStart(2,"0");trendMap[k]=(trendMap[k]||0)+e.amount;});
  const trendData=Object.entries(trendMap).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>{const[y,m]=k.split("-");return{label:MONTHS[parseInt(m)]+" "+y.slice(2),amount:v};});
  const subMap={};filtered.forEach(e=>{subMap[e.subcategory]=(subMap[e.subcategory]||0)+e.amount;});
  const subBreakdown=Object.entries(subMap).map(([name,value])=>({name,value}));
  const sorted=[...filtered].sort((a,b)=>b.year!==a.year?b.year-a.year:b.month-a.month);
  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6"><button onClick={onBack} className="text-blue-100 hover:text-white mb-2 font-semibold text-sm">← Back</button><h1 className="text-3xl font-bold">{title}</h1><p className="text-blue-100 text-sm">{subtitle}</p></header>
      <NavBar view={navView} setView={setView} role={role}/>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <ExpFilterBar filter={filter} setFilter={setFilter} entries={allEntries}/>
        <div className="grid grid-cols-3 gap-4"><MetricCard label="Total" value={"₹"+total.toLocaleString()} bg="bg-emerald-50" borderColor="border-emerald-500"/><MetricCard label="Avg/Entry" value={"₹"+avg.toLocaleString()} bg="bg-blue-50" borderColor="border-blue-400"/><MetricCard label="Entries" value={filtered.length} bg="bg-purple-50" borderColor="border-purple-400"/></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-5"><h3 className="font-bold mb-4">📈 Trend</h3>{trendData.length===0?<p className="text-gray-400 text-sm text-center py-10">No data</p>:<ResponsiveContainer width="100%" height={200}><BarChart data={trendData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label" tick={{fontSize:10}} angle={-30} textAnchor="end" height={50}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={v=>"₹"+v.toLocaleString()}/><Bar dataKey="amount" fill="#3b82f6" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer>}</div>
          <div className="bg-white rounded-lg shadow p-5"><h3 className="font-bold mb-4">🥧 By Sub-Item</h3>{subBreakdown.length===0?<p className="text-gray-400 text-sm text-center py-10">No data</p>:<ResponsiveContainer width="100%" height={200}><PieChart><Pie data={subBreakdown} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={p=>p.name.split(" ")[0]+" "+(p.percent*100).toFixed(0)+"%"}>{subBreakdown.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={v=>"₹"+v.toLocaleString()}/><Legend/></PieChart></ResponsiveContainer>}</div>
        </div>
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <div className="px-5 py-3 border-b"><h3 className="font-bold">All Entries ({filtered.length})</h3></div>
          <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Year</th><th className="px-4 py-3 text-left">Month</th><th className="px-4 py-3 text-left">Sub-Item</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Units</th></tr></thead>
          <tbody>{sorted.length===0&&<tr><td colSpan={5} className="text-center py-8 text-gray-400">No entries</td></tr>}{sorted.map(e=>(<tr key={e.id} className="border-t hover:bg-gray-50"><td className="px-4 py-3">{e.year}</td><td className="px-4 py-3">{MONTHS[e.month]}</td><td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">{e.subcategory}</span></td><td className="px-4 py-3 text-right font-semibold">₹{e.amount.toLocaleString()}</td><td className="px-4 py-3 text-right text-gray-500">{e.units} {e.unitType}</td></tr>))}</tbody>
          {filtered.length>0&&<tfoot className="bg-gray-50 border-t-2"><tr><td colSpan={3} className="px-4 py-3 font-bold">Total</td><td className="px-4 py-3 text-right font-bold text-emerald-700">₹{filtered.reduce((s,e)=>s+e.amount,0).toLocaleString()}</td><td></td></tr></tfoot>}
          </table>
        </div>
      </main>
    </div>
  );
}

function MeetingsPage({data,setData,setView,navView,isAdmin,role="admin"}){
  const [selId,setSelId]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [nf,setNf]=useState({date:TODAY.toISOString().split("T")[0],title:"",year:TODAY.getFullYear()<START_YEAR?START_YEAR:TODAY.getFullYear(),month:TODAY.getMonth(),venue:"",chairperson:"",attendees:"",description:""});
  const [newTask,setNewTask]=useState({description:"",owner:"",dueDate:"",link:"",priority:"Medium",status:"Not Started"});
  const [newNote,setNewNote]=useState("");
  const [expandedTask,setExpandedTask]=useState(null);
  const [taskComment,setTaskComment]=useState({});
  const [addingComment,setAddingComment]=useState(null);

  const mtg=selId?data.meetings.find(m=>m.id===selId):null;
  function updMtg(upd){setData(p=>({...p,meetings:p.meetings.map(m=>m.id===selId?{...m,...upd}:m)}));}
  function addMeeting(){if(!nf.title.trim()) return;const m={id:Date.now().toString(),...nf,actionItems:[],notes:[],decisions:[]};setData(p=>({...p,meetings:[...p.meetings,m]}));setSelId(m.id);setShowNew(false);}
  function delMeeting(id){if(!window.confirm("Delete meeting?")) return;setData(p=>({...p,meetings:p.meetings.filter(m=>m.id!==id)}));if(selId===id) setSelId(null);}
  function addTask(){if(!newTask.description.trim()) return;const t={id:Date.now().toString(),...newTask,comments:[],createdAt:TODAY.toISOString().split("T")[0]};updMtg({actionItems:[...(mtg.actionItems||[]),t]});setNewTask({description:"",owner:"",dueDate:"",link:"",priority:"Medium",status:"Not Started"});}
  function updTask(tid,upd){updMtg({actionItems:(mtg.actionItems||[]).map(t=>t.id===tid?{...t,...upd}:t)});}
  function delTask(tid){updMtg({actionItems:(mtg.actionItems||[]).filter(t=>t.id!==tid)});}
  function addTaskComment(tid){const txt=(taskComment[tid]||"").trim();if(!txt) return;const comment={id:Date.now().toString(),text:txt,date:TODAY.toISOString().split("T")[0]};updTask(tid,{comments:[...((mtg.actionItems||[]).find(t=>t.id===tid)?.comments||[]),comment]});setTaskComment(prev=>({...prev,[tid]:""}));setAddingComment(null);}
  function delTaskComment(tid,cid){const task=(mtg.actionItems||[]).find(t=>t.id===tid);updTask(tid,{comments:(task.comments||[]).filter(c=>c.id!==cid)});}
  function addNote(){if(!newNote.trim()) return;updMtg({notes:[...(mtg.notes||[]),{id:Date.now().toString(),text:newNote,date:TODAY.toISOString().split("T")[0]}]});setNewNote("");}
  function addDecision(txt){if(!txt.trim()) return;updMtg({decisions:[...(mtg.decisions||[]),{id:Date.now().toString(),text:txt}]});}

  if(selId&&mtg){
    const tasks=mtg.actionItems||[];
    const total=tasks.length,done=tasks.filter(t=>t.status==="Completed").length,pct=total?Math.round(done/total*100):0;
    const bySt={};TASK_STATUSES.forEach(s=>{bySt[s]=tasks.filter(t=>t.status===s).length;});
    return(
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6">
          <button onClick={()=>setSelId(null)} className="text-indigo-100 hover:text-white mb-2 font-semibold text-sm">← All Meetings</button>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div><h1 className="text-2xl font-bold">{mtg.title}</h1><p className="text-indigo-100 text-sm mt-1">📅 {fmtIndian(mtg.date)} · 📍 {mtg.venue||"TBD"} · 🪑 {mtg.chairperson||"—"}</p>{mtg.attendees&&<p className="text-indigo-200 text-xs mt-0.5">👥 {mtg.attendees}</p>}</div>
            <span className="px-3 py-1 bg-white text-indigo-700 rounded-full text-xs font-bold self-start">{MONTHS[mtg.month]} {mtg.year}</span>
          </div>
        </header>
        <NavBar view={navView} setView={setView} role={role}/>
        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="bg-white rounded-xl shadow p-5">
            <div className="flex justify-between items-center mb-3"><h3 className="font-bold text-gray-700">📊 Progress Overview</h3><span className="text-sm font-semibold text-gray-600">{done}/{total} completed · {pct}%</span></div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden"><div className="bg-indigo-500 h-3 rounded-full transition-all duration-500" style={{width:pct+"%"}}></div></div>
            <div className="grid grid-cols-5 gap-2">{TASK_STATUSES.map(s=>{const st=STATUS_STYLE[s];return(<div key={s} className={`text-center p-2 rounded-lg border ${st.bg} ${st.border}`}><p className={`text-xl font-bold ${st.text}`}>{bySt[s]||0}</p><p className={`text-xs font-semibold ${st.text} leading-tight mt-0.5`}>{s}</p></div>);})}</div>
          </div>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-5 py-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-700">✅ Action Items ({tasks.length})</h3>
              {tasks.length>0&&<span className="text-xs text-gray-400">{tasks.filter(t=>t.status!=="Completed"&&t.status!=="Deferred").length} pending</span>}
            </div>
            {tasks.length===0&&<p className="text-sm text-gray-400 italic text-center py-8">No action items yet.</p>}
            <div className="divide-y">
              {tasks.map(t=>{
                const st=STATUS_STYLE[t.status||"Not Started"];
                const isExp=expandedTask===t.id;
                const comments=t.comments||[];
                const isOverdue=t.dueDate&&new Date(t.dueDate)<TODAY&&t.status!=="Completed";
                return(
                  <div key={t.id} className="hover:bg-gray-50 transition">
                    <div className="px-5 py-3 flex items-start gap-3">
                      <button onClick={()=>{if(!isAdmin) return;const idx=TASK_STATUSES.indexOf(t.status||"Not Started");updTask(t.id,{status:TASK_STATUSES[(idx+1)%TASK_STATUSES.length]});}} disabled={!isAdmin} title="Click to cycle status" className={`mt-0.5 px-2 py-1 rounded-lg text-xs font-bold border whitespace-nowrap flex-shrink-0 ${st.bg} ${st.text} ${st.border} ${isAdmin?"hover:opacity-80 cursor-pointer":"cursor-default"}`}>
                        {st.icon} {t.status||"Not Started"}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={"text-sm font-semibold "+(t.status==="Completed"?"line-through text-gray-400":"text-gray-800")}>{t.description}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 items-center">
                          {t.owner&&<span>👤 {t.owner}</span>}
                          {t.dueDate&&<span className={isOverdue?"text-red-500 font-semibold":""}>📅 {fmtIndian(t.dueDate)}{isOverdue&&" ⚠️"}</span>}
                          <span className={PRIORITY_STYLE[t.priority||"Medium"]}>⚡ {t.priority||"Medium"}</span>
                          {t.link&&<a href={t.link} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-0.5"><ExternalLink size={10}/> Link</a>}
                          {comments.length>0&&<span className="text-indigo-500 font-semibold">💬 {comments.length}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-1">
                        {isAdmin&&<button onClick={()=>setAddingComment(addingComment===t.id?null:t.id)} title="Add comment" className={"p-1 rounded "+(addingComment===t.id?"text-indigo-600 bg-indigo-50":"text-indigo-400 hover:text-indigo-600")}><MessageSquare size={14}/></button>}
                        <button onClick={()=>setExpandedTask(isExp?null:t.id)} className="p-1 text-gray-400 hover:text-gray-600">{isExp?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button>
                        {isAdmin&&<button onClick={()=>delTask(t.id)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14}/></button>}
                      </div>
                    </div>
                    {(comments.length>0||addingComment===t.id)&&(
                      <div className="px-5 pb-3 ml-16 space-y-2">
                        {comments.map(c=>(<div key={c.id} className="flex items-start gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2"><MessageSquare size={12} className="text-indigo-400 mt-0.5 flex-shrink-0"/><div className="flex-1"><p className="text-xs text-gray-700">{c.text}</p><p className="text-xs text-gray-400 mt-0.5">{fmtIndian(c.date)}</p></div>{isAdmin&&<button onClick={()=>delTaskComment(t.id,c.id)} className="text-red-300 hover:text-red-500"><Trash2 size={11}/></button>}</div>))}
                        {isAdmin&&addingComment===t.id&&(<div className="flex gap-2"><input type="text" value={taskComment[t.id]||""} onChange={e=>setTaskComment(prev=>({...prev,[t.id]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter") addTaskComment(t.id);}} placeholder="Add a status comment or update..." autoFocus className="flex-1 px-3 py-1.5 border border-indigo-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-400 outline-none"/><button onClick={()=>addTaskComment(t.id)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700">Post</button><button onClick={()=>setAddingComment(null)} className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded-lg text-xs font-semibold">✕</button></div>)}
                      </div>
                    )}
                    {isExp&&(
                      <div className="border-t bg-indigo-50 px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Description</label><input type="text" value={t.description} onChange={e=>isAdmin&&updTask(t.id,{description:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm"/></div>
                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Status</label><select value={t.status||"Not Started"} onChange={e=>isAdmin&&updTask(t.id,{status:e.target.value})} disabled={!isAdmin} className={`w-full px-2 py-1.5 border rounded text-sm font-semibold ${STATUS_STYLE[t.status||"Not Started"].bg} ${STATUS_STYLE[t.status||"Not Started"].text}`}>{TASK_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Owner</label><input type="text" value={t.owner||""} onChange={e=>isAdmin&&updTask(t.id,{owner:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm"/></div>
                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Due Date</label><input type="date" value={t.dueDate||""} onChange={e=>isAdmin&&updTask(t.id,{dueDate:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm"/></div>
                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Priority</label><select value={t.priority||"Medium"} onChange={e=>isAdmin&&updTask(t.id,{priority:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm">{["High","Medium","Low"].map(p=><option key={p}>{p}</option>)}</select></div>
                        <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 mb-1">Reference Link</label><input type="url" value={t.link||""} onChange={e=>isAdmin&&updTask(t.id,{link:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm"/></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {isAdmin&&(
              <div className="border-t bg-indigo-50 p-5">
                <p className="text-xs font-bold text-indigo-700 mb-3">+ ADD ACTION ITEM</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                  <div className="col-span-2 md:col-span-3"><input type="text" value={newTask.description} onChange={e=>setNewTask({...newTask,description:e.target.value})} placeholder="Task description *" className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><input type="text" value={newTask.owner} onChange={e=>setNewTask({...newTask,owner:e.target.value})} placeholder="Assigned to..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><input type="date" value={newTask.dueDate} onChange={e=>setNewTask({...newTask,dueDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><select value={newTask.status} onChange={e=>setNewTask({...newTask,status:e.target.value})} className={`w-full px-3 py-2 border rounded-lg text-sm font-semibold ${STATUS_STYLE[newTask.status].bg} ${STATUS_STYLE[newTask.status].text}`}>{TASK_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
                  <div><select value={newTask.priority} onChange={e=>setNewTask({...newTask,priority:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option>High</option><option>Medium</option><option>Low</option></select></div>
                  <div className="col-span-2"><input type="url" value={newTask.link} onChange={e=>setNewTask({...newTask,link:e.target.value})} placeholder="Reference link (optional)" className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                </div>
                <button onClick={addTask} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">+ Add Task</button>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-bold text-gray-700 mb-4">🏛️ Key Decisions</h3>
            <div className="space-y-2 mb-3">{(mtg.decisions||[]).map(d=>(<div key={d.id} className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2"><p className="text-sm text-gray-700">📌 {d.text}</p>{isAdmin&&<button onClick={()=>updMtg({decisions:(mtg.decisions).filter(x=>x.id!==d.id)})} className="text-red-400 hover:text-red-600 ml-3"><Trash2 size={13}/></button>}</div>))}</div>
            {isAdmin&&<div className="flex gap-2"><input id="dec-inp" type="text" placeholder="Record a decision..." className="flex-1 px-3 py-2 border rounded-lg text-sm"/><button onClick={()=>{const el=document.getElementById("dec-inp");if(el.value){addDecision(el.value);el.value="";}}} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Add</button></div>}
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-bold text-gray-700 mb-4">📝 Meeting Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[["Title","title"],["Venue","venue"],["Chairperson","chairperson"],["Attendees","attendees"]].map(([l,f])=>(<div key={f}><label className="block text-xs font-semibold text-gray-500 mb-1">{l}</label><input type="text" value={mtg[f]||""} onChange={e=>isAdmin&&updMtg({[f]:e.target.value})} disabled={!isAdmin} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>))}
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Date</label><input type="date" value={mtg.date||""} onChange={e=>isAdmin&&updMtg({date:e.target.value})} disabled={!isAdmin} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-bold text-gray-700 mb-4">🗒️ Meeting Notes</h3>
            <div className="space-y-2 mb-3">{(mtg.notes||[]).map(n=>(<div key={n.id} className="flex items-start justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2"><div><p className="text-sm text-gray-700">{n.text}</p><p className="text-xs text-gray-400 mt-0.5">{fmtIndian(n.date)}</p></div>{isAdmin&&<button onClick={()=>updMtg({notes:(mtg.notes).filter(x=>x.id!==n.id)})} className="text-red-400 hover:text-red-600 ml-2"><Trash2 size={13}/></button>}</div>))}</div>
            {isAdmin&&<div className="flex gap-2"><input type="text" value={newNote} onChange={e=>setNewNote(e.target.value)} onKeyDown={e=>{if(e.key==="Enter") addNote();}} placeholder="Add a note..." className="flex-1 px-3 py-2 border rounded-lg text-sm"/><button onClick={addNote} className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-semibold hover:bg-yellow-600">Add</button></div>}
          </div>
        </main>
      </div>
    );
  }

  const allTasks=data.meetings.flatMap(m=>m.actionItems||[]);
  const openTasks=allTasks.filter(t=>t.status!=="Completed"&&t.status!=="Deferred");
  const overdueTasks=allTasks.filter(t=>t.dueDate&&new Date(t.dueDate)<TODAY&&t.status!=="Completed");
  const sorted=[...data.meetings].reverse();
  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">📋 Meetings</h1>
            <p className="text-indigo-200 text-xs mt-0.5">{data.meetings.length} meetings · {openTasks.length} open tasks{overdueTasks.length>0&&<span className="text-red-300"> · ⚠️ {overdueTasks.length} overdue</span>}</p>
          </div>
          {isAdmin&&<button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 rounded-xl font-bold text-sm hover:bg-indigo-50 shadow transition"><Plus size={14}/> New Meeting</button>}
        </div>
      </header>
      <NavBar view={navView} setView={setView} role={role}/>
      <main className="max-w-5xl mx-auto px-6 py-6 space-y-5">

        {/* Stat row */}
        {data.meetings.length>0&&(
          <div className="grid grid-cols-4 gap-3">
            {[["📋",data.meetings.length,"Meetings","indigo"],["⚡",openTasks.length,"Open Tasks","blue"],["⚠️",overdueTasks.length,"Overdue","red"],["✅",allTasks.filter(t=>t.status==="Completed").length,"Done","green"]].map(([icon,val,label,c])=>(
              <div key={label} className={`bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center`}>
                <p className="text-lg">{icon}</p>
                <p className={`text-xl font-bold text-${c}-600`}>{val}</p>
                <p className="text-xs text-gray-400 font-medium">{label}</p>
              </div>
            ))}
          </div>
        )}

        {showNew&&isAdmin&&(
          <div className="bg-white rounded-2xl shadow-md border border-indigo-100 p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800">Create Meeting</h3>
              <button onClick={()=>setShowNew(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label><input type="text" value={nf.title} onChange={e=>setNf({...nf,title:e.target.value})} placeholder="e.g. Q1 Residents Meeting" className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Date</label><input type="date" value={nf.date} onChange={e=>setNf({...nf,date:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Year</label><select value={nf.year} onChange={e=>setNf({...nf,year:parseInt(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm">{YEARS.map(y=><option key={y}>{y}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Month</label><select value={nf.month} onChange={e=>setNf({...nf,month:parseInt(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm">{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Venue</label><input type="text" value={nf.venue} onChange={e=>setNf({...nf,venue:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Chairperson</label><input type="text" value={nf.chairperson} onChange={e=>setNf({...nf,chairperson:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Attendees</label><input type="text" value={nf.attendees} onChange={e=>setNf({...nf,attendees:e.target.value})} placeholder="Flat 101, 102..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            </div>
            <div className="flex gap-2"><button onClick={addMeeting} className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700">Create</button><button onClick={()=>setShowNew(false)} className="px-5 py-2 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm">Cancel</button></div>
          </div>
        )}

        {sorted.length===0&&!showNew&&<div className="text-center py-16 text-gray-300"><p className="text-6xl mb-4">📋</p><p className="text-lg font-semibold text-gray-400">No meetings yet</p></div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map(m=>{
            const tasks=m.actionItems||[];const done=tasks.filter(t=>t.status==="Completed").length;const pct=tasks.length?Math.round(done/tasks.length*100):0;
            const overdue=tasks.filter(t=>t.dueDate&&new Date(t.dueDate)<TODAY&&t.status!=="Completed").length;
            return(
              <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-200 transition cursor-pointer flex flex-col" onClick={()=>setSelId(m.id)}>
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide">{MONTHS[m.month]} {m.year}</span>
                      <h3 className="font-bold text-gray-800 text-sm mt-0.5 leading-tight">{m.title}</h3>
                    </div>
                    {isAdmin&&<button onClick={e=>{e.stopPropagation();delMeeting(m.id);}} className="p-1 text-gray-300 hover:text-red-500 flex-shrink-0 rounded hover:bg-red-50 transition"><Trash2 size={13}/></button>}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">📅 {fmtIndian(m.date)}{m.venue&&<> · 📍 {m.venue}</>}</p>
                  {tasks.length>0&&(
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>{done}/{tasks.length} tasks</span>
                        <span className="font-bold text-indigo-500">{pct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{width:pct+"%"}}></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50 rounded-b-2xl flex items-center gap-3 text-xs text-gray-400">
                  {tasks.length>0&&<span className="text-blue-500 font-semibold">⚡ {tasks.filter(t=>t.status!=="Completed"&&t.status!=="Deferred").length} open</span>}
                  {overdue>0&&<span className="text-red-500 font-semibold">⚠️ {overdue} overdue</span>}
                  {(mtg?.decisions||m.decisions||[]).length>0&&<span>📌 {(m.decisions||[]).length} decisions</span>}
                  <span className="ml-auto text-indigo-400 font-semibold text-xs">Open →</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function IncidentsPage({data,setData,setView,navView,isAdmin,role="admin"}){
  const [showNew,setShowNew]=useState(false);
  const [exp,setExp]=useState(null);
  const [newUpdate,setNewUpdate]=useState("");
  const [filterSev,setFilterSev]=useState("All");
  const [filterStatus,setFilterStatus]=useState("All");
  const [nf,setNf]=useState({date:TODAY.toISOString().split("T")[0],title:"",severity:"Medium",location:"",reportedBy:"",description:"",affectedFlats:"",status:"Open"});
  function add(){if(!nf.title.trim()) return;const inc={id:Date.now().toString(),...nf,updates:[],resolvedDate:"",resolutionNotes:""};setData(p=>({...p,incidents:[inc,...(p.incidents||[])]}));setShowNew(false);setNf({date:TODAY.toISOString().split("T")[0],title:"",severity:"Medium",location:"",reportedBy:"",description:"",affectedFlats:"",status:"Open"});}
  function upd(id,u){setData(p=>({...p,incidents:(p.incidents||[]).map(i=>i.id===id?{...i,...u}:i)}));}
  function del(id){if(!window.confirm("Delete?")) return;setData(p=>({...p,incidents:(p.incidents||[]).filter(i=>i.id!==id)}));}
  function addUpd(inc){if(!newUpdate.trim()) return;upd(inc.id,{updates:[...(inc.updates||[]),{id:Date.now().toString(),text:newUpdate,date:TODAY.toISOString().split("T")[0]}]});setNewUpdate("");}
  const incidents=data.incidents||[];
  const open=incidents.filter(i=>i.status==="Open"||i.status==="In Progress").length;
  const critical=incidents.filter(i=>i.severity==="Critical"&&(i.status==="Open"||i.status==="In Progress")).length;
  const filtered=incidents.filter(i=>{
    const ms=filterStatus==="All"||i.status===filterStatus;
    const sv=filterSev==="All"||i.severity===filterSev;
    return ms&&sv;
  });
  const SEV_ICON={"Low":"🟢","Medium":"🟡","High":"🟠","Critical":"🔴"};

  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-red-600 to-rose-700 text-white px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">🚨 Incidents</h1>
            <p className="text-red-100 text-xs mt-0.5">{open} active · {incidents.length} total{critical>0&&<span className="text-yellow-300 font-bold"> · {critical} Critical</span>}</p>
          </div>
          {isAdmin&&<button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-2 px-4 py-2 bg-white text-red-700 rounded-xl font-bold text-sm hover:bg-red-50 shadow transition"><Plus size={14}/> Report Incident</button>}
        </div>
      </header>
      <NavBar view={navView} setView={setView} role={role}/>
      <main className="max-w-5xl mx-auto px-6 py-6 space-y-4">

        {showNew&&isAdmin&&(
          <div className="bg-white rounded-2xl shadow-md border border-red-100 p-5">
            <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-gray-800">Report New Incident</h3><button onClick={()=>setShowNew(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button></div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label><input type="text" value={nf.title} onChange={e=>setNf({...nf,title:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Date</label><input type="date" value={nf.date} onChange={e=>setNf({...nf,date:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Severity</label><select value={nf.severity} onChange={e=>setNf({...nf,severity:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{INCIDENT_SEVERITIES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Status</label><select value={nf.status} onChange={e=>setNf({...nf,status:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{["Open","In Progress","Resolved","Closed"].map(s=><option key={s}>{s}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Location</label><input type="text" value={nf.location} onChange={e=>setNf({...nf,location:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Reported By</label><input type="text" value={nf.reportedBy} onChange={e=>setNf({...nf,reportedBy:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Affected Flats</label><input type="text" value={nf.affectedFlats} onChange={e=>setNf({...nf,affectedFlats:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Description</label><textarea value={nf.description} onChange={e=>setNf({...nf,description:e.target.value})} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm resize-none"/></div>
            </div>
            <div className="flex gap-2"><button onClick={add} className="px-5 py-2 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700">Report</button><button onClick={()=>setShowNew(false)} className="px-5 py-2 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm">Cancel</button></div>
          </div>
        )}

        {/* Filter bar */}
        {incidents.length>0&&(
          <div className="flex flex-wrap gap-2 items-center bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-2.5">
            <span className="text-xs font-bold text-gray-400 mr-1">Status:</span>
            {["All","Open","In Progress","Resolved","Closed"].map(s=>(
              <button key={s} onClick={()=>setFilterStatus(s)} className={"px-2.5 py-1 rounded-lg text-xs font-semibold transition "+(filterStatus===s?"bg-red-600 text-white":"bg-gray-100 text-gray-500 hover:bg-gray-200")}>{s}</button>
            ))}
            <span className="text-xs font-bold text-gray-400 ml-3 mr-1">Severity:</span>
            {["All",...INCIDENT_SEVERITIES].map(s=>(
              <button key={s} onClick={()=>setFilterSev(s)} className={"px-2.5 py-1 rounded-lg text-xs font-semibold transition "+(filterSev===s?"bg-gray-700 text-white":"bg-gray-100 text-gray-500 hover:bg-gray-200")}>{s}</button>
            ))}
          </div>
        )}

        {filtered.length===0&&!showNew&&<div className="text-center py-16 text-gray-300"><p className="text-6xl mb-4">🚨</p><p className="text-gray-400">No incidents found</p></div>}
        <div className="space-y-3">
          {filtered.map(inc=>{
            const isExp=exp===inc.id;
            const isActive=inc.status==="Open"||inc.status==="In Progress";
            return(
              <div key={inc.id} className={"bg-white rounded-2xl shadow-sm border overflow-hidden transition "+(inc.severity==="Critical"&&isActive?"border-red-300":"border-gray-100")}>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0 mt-0.5">{SEV_ICON[inc.severity]||"⚪"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-gray-800 text-sm">{inc.title}</h3>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <span className={"text-xs px-2 py-0.5 rounded-full font-semibold border "+SEV_COLORS[inc.severity]}>{inc.severity}</span>
                            <span className={"text-xs px-2 py-0.5 rounded-full font-semibold "+(inc.status==="Resolved"||inc.status==="Closed"?"bg-green-100 text-green-700":inc.status==="In Progress"?"bg-blue-100 text-blue-700":"bg-red-100 text-red-700")}>{inc.status}</span>
                            {inc.affectedFlats&&<span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-semibold">Flats: {inc.affectedFlats}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {isAdmin&&<button onClick={()=>setExp(isExp?null:inc.id)} className={"p-1.5 rounded-lg transition "+(isExp?"text-blue-600 bg-blue-50":"text-gray-400 hover:text-gray-600 hover:bg-gray-100")}>{isExp?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button>}
                          {isAdmin&&<button onClick={()=>del(inc.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition"><Trash2 size={14}/></button>}
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">{fmtIndian(inc.date)}{inc.location&&<> · 📍 {inc.location}</>}{inc.reportedBy&&<> · 👤 {inc.reportedBy}</>}</p>
                      {inc.description&&<p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{inc.description}</p>}
                      {(inc.updates||[]).length>0&&<p className="text-xs text-blue-500 mt-1 font-semibold">💬 {inc.updates.length} update{inc.updates.length>1?"s":""}</p>}
                    </div>
                  </div>
                </div>
                {isExp&&isAdmin&&(
                  <div className="border-t bg-gray-50 p-4 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div><label className="block text-xs font-semibold text-gray-500 mb-1">Status</label><select value={inc.status} onChange={e=>upd(inc.id,{status:e.target.value})} className="w-full px-2 py-1.5 border rounded-lg text-sm">{["Open","In Progress","Resolved","Closed"].map(s=><option key={s}>{s}</option>)}</select></div>
                      <div><label className="block text-xs font-semibold text-gray-500 mb-1">Severity</label><select value={inc.severity} onChange={e=>upd(inc.id,{severity:e.target.value})} className="w-full px-2 py-1.5 border rounded-lg text-sm">{INCIDENT_SEVERITIES.map(s=><option key={s}>{s}</option>)}</select></div>
                      <div><label className="block text-xs font-semibold text-gray-500 mb-1">Resolved Date</label><input type="date" value={inc.resolvedDate||""} onChange={e=>upd(inc.id,{resolvedDate:e.target.value})} className="w-full px-2 py-1.5 border rounded-lg text-sm"/></div>
                      <div><label className="block text-xs font-semibold text-gray-500 mb-1">Resolution Notes</label><input type="text" value={inc.resolutionNotes||""} onChange={e=>upd(inc.id,{resolutionNotes:e.target.value})} className="w-full px-2 py-1.5 border rounded-lg text-sm"/></div>
                    </div>
                    {(inc.updates||[]).length>0&&(
                      <div className="space-y-2">{inc.updates.map(u=><div key={u.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700">💬 {u.text}<span className="text-gray-400 ml-2">{fmtIndian(u.date)}</span></div>)}</div>
                    )}
                    <div className="flex gap-2">
                      <input type="text" value={newUpdate} onChange={e=>setNewUpdate(e.target.value)} onKeyDown={e=>{if(e.key==="Enter") addUpd(inc);}} placeholder="Add an update..." className="flex-1 px-3 py-2 border rounded-lg text-sm"/>
                      <button onClick={()=>addUpd(inc)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Add</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function WatchmanPage({data,setData,setView,navView,isAdmin,role="admin"}){
  const [showNew,setShowNew]=useState(false);
  const [showResignConfirm,setShowResignConfirm]=useState(false);
  const [editProfile,setEditProfile]=useState(false);
  const [newChild,setNewChild]=useState("");
  const [tab,setTab]=useState("profile"); // "profile" | "leaves" | "past"
  const [nf,setNf]=useState({watchmanName:"",fromDate:TODAY.toISOString().split("T")[0],toDate:"",reason:"",leaveType:"Casual Leave",coverArrangement:"",approvedBy:"",notes:""});
  const photoRef=useRef(null);

  const wm=data.watchman||{name:"",phone:"",photo:"",joiningDate:"",emergencyContact:"",address:"",spouseName:"",children:[],notes:""};
  const [draftWm,setDraftWm]=useState(wm);

  function days(f,t){if(!f||!t) return 1;const d=Math.ceil((new Date(t)-new Date(f))/(864e5))+1;return d<1?1:d;}
  function add(){if(!nf.watchmanName.trim()||!nf.fromDate) return;const l={id:Date.now().toString(),...nf,status:"Approved"};setData(p=>({...p,watchmanLeaves:[l,...(p.watchmanLeaves||[])]}));setShowNew(false);setNf({watchmanName:"",fromDate:TODAY.toISOString().split("T")[0],toDate:"",reason:"",leaveType:"Casual Leave",coverArrangement:"",approvedBy:"",notes:""});}
  function upd(id,u){setData(p=>({...p,watchmanLeaves:(p.watchmanLeaves||[]).map(l=>l.id===id?{...l,...u}:l)}));}
  function del(id){if(!window.confirm("Delete?")) return;setData(p=>({...p,watchmanLeaves:(p.watchmanLeaves||[]).filter(l=>l.id!==id)}));}

  function saveProfile(){
    setData(p=>({...p,watchman:{...draftWm}}));
    setEditProfile(false);
  }
  function handlePhoto(file){
    if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>setDraftWm(d=>({...d,photo:e.target.result}));
    reader.readAsDataURL(file);
  }
  function addChild(){if(!newChild.trim()) return;setDraftWm(d=>({...d,children:[...(d.children||[]),newChild.trim()]}));setNewChild("");}
  function removeChild(i){setDraftWm(d=>({...d,children:(d.children||[]).filter((_,idx)=>idx!==i)}));}

  function resignWatchman(){
    const resigned={...wm,resignDate:TODAY.toISOString().split("T")[0],leaves:(data.watchmanLeaves||[]).filter(l=>l.watchmanName===wm.name)};
    setData(p=>({...p,pastWatchmen:[resigned,...(p.pastWatchmen||[])],watchman:{name:"",phone:"",photo:"",joiningDate:"",emergencyContact:"",address:"",spouseName:"",children:[],notes:""},watchmanLeaves:(p.watchmanLeaves||[]).filter(l=>l.watchmanName!==wm.name)}));
    setShowResignConfirm(false);setDraftWm({name:"",phone:"",photo:"",joiningDate:"",emergencyContact:"",address:"",spouseName:"",children:[],notes:""});
  }

  const leaves=data.watchmanLeaves||[];
  const pastWatchmen=data.pastWatchmen||[];
  const thisMonth=leaves.filter(l=>{const d=new Date(l.fromDate);return d.getFullYear()===TODAY.getFullYear()&&d.getMonth()===TODAY.getMonth();});
  const thisYear=leaves.filter(l=>new Date(l.fromDate).getFullYear()===TODAY.getFullYear());
  const hasProfile=wm.name&&wm.name.trim()!=="";

  return(
    <div className="min-h-screen bg-gray-50">
      {/* Resign confirmation modal */}
      {showResignConfirm&&(
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-center mb-4"><span className="text-5xl">⚠️</span></div>
            <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Confirm Resignation</h2>
            <p className="text-sm text-gray-600 text-center mb-1">Are you sure you want to mark <strong>{wm.name}</strong> as resigned?</p>
            <p className="text-xs text-gray-400 text-center mb-5">All profile details and leave records for this watchman will be moved to Past Watchmen history. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={resignWatchman} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700">Yes, Mark Resigned</button>
              <button onClick={()=>setShowResignConfirm(false)} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-gradient-to-r from-teal-600 to-teal-700 text-white p-6">
        <h1 className="text-3xl font-bold">👷 Watchman</h1>
        {hasProfile&&<p className="text-teal-100 text-sm mt-1">{wm.name} · Since {wm.joiningDate?fmtIndian(wm.joiningDate):"N/A"}</p>}
      </header>
      <NavBar view={navView} setView={setView} role={role}/>

      {/* Tab bar */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-6 flex gap-0">
          {[["profile","👤 Profile"],["leaves","📋 Leaves"],["past","🕐 Past Watchmen"]].map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t)} className={"px-4 py-3 text-sm font-bold border-b-2 transition whitespace-nowrap "+(tab===t?"border-teal-600 text-teal-700":"border-transparent text-gray-500 hover:text-gray-700")}>{label}</button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── PROFILE TAB ── */}
        {tab==="profile"&&(
          <div className="space-y-6">
            {!hasProfile&&!editProfile&&isAdmin&&(
              <div className="text-center py-16 bg-white rounded-2xl shadow">
                <span className="text-6xl">👷</span>
                <p className="text-gray-500 mt-4 mb-4">No watchman profile set up yet.</p>
                <button onClick={()=>{setDraftWm({name:"",phone:"",photo:"",joiningDate:"",emergencyContact:"",address:"",spouseName:"",children:[],notes:""});setEditProfile(true);}} className="px-6 py-2 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700">+ Add Watchman Profile</button>
              </div>
            )}
            {hasProfile&&!editProfile&&(
              <div className="bg-white rounded-2xl shadow overflow-hidden">
                {/* Profile card header */}
                <div className="bg-gradient-to-r from-teal-600 to-teal-700 p-6 flex items-center gap-5">
                  <div className="w-24 h-24 rounded-full ring-4 ring-white ring-opacity-50 overflow-hidden bg-teal-800 flex items-center justify-center flex-shrink-0 shadow-lg">
                    {wm.photo?<img src={wm.photo} alt={wm.name} className="w-full h-full object-cover"/>:<span className="text-4xl font-bold text-white">{wm.name[0]?.toUpperCase()}</span>}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-white">{wm.name}</h2>
                    {wm.joiningDate&&<p className="text-teal-100 text-sm mt-0.5">📅 Effective from {fmtIndian(wm.joiningDate)}</p>}
                    {wm.phone&&<p className="text-teal-100 text-sm">📞 {wm.phone}</p>}
                  </div>
                  {isAdmin&&(
                    <div className="flex flex-col gap-2">
                      <button onClick={()=>{setDraftWm({...wm,children:wm.children||[]});setEditProfile(true);}} className="px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-lg text-sm font-semibold border border-white border-opacity-30">✏️ Edit</button>
                      <button onClick={()=>setShowResignConfirm(true)} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold">🚪 Resigned</button>
                    </div>
                  )}
                </div>
                {/* Profile details */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-bold text-gray-700 border-b pb-2">📋 Personal Details</h3>
                    {wm.address&&<div><p className="text-xs font-bold text-gray-400 uppercase">Address</p><p className="text-sm text-gray-700 mt-0.5">{wm.address}</p></div>}
                    {wm.emergencyContact&&<div><p className="text-xs font-bold text-gray-400 uppercase">Emergency Contact</p><p className="text-sm text-gray-700 mt-0.5">📞 {wm.emergencyContact}</p></div>}
                    {wm.notes&&<div><p className="text-xs font-bold text-gray-400 uppercase">Notes</p><p className="text-sm text-gray-600 italic mt-0.5">{wm.notes}</p></div>}
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-bold text-gray-700 border-b pb-2">👨‍👩‍👧‍👦 Family Details</h3>
                    {wm.spouseName&&<div><p className="text-xs font-bold text-gray-400 uppercase">Spouse</p><p className="text-sm text-gray-700 mt-0.5">💑 {wm.spouseName}</p></div>}
                    {(wm.children||[]).length>0&&<div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Children ({wm.children.length})</p><div className="flex flex-wrap gap-2">{wm.children.map((c,i)=><span key={i} className="px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-semibold border border-teal-200">👦 {c}</span>)}</div></div>}
                    {!wm.spouseName&&(!wm.children||wm.children.length===0)&&<p className="text-sm text-gray-400 italic">No family details added.</p>}
                  </div>
                </div>
                {/* Leave summary */}
                <div className="border-t bg-gray-50 px-6 py-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center"><p className="text-2xl font-bold text-teal-700">{thisMonth.length}</p><p className="text-xs text-gray-500 font-semibold">This Month</p></div>
                    <div className="text-center"><p className="text-2xl font-bold text-blue-700">{thisYear.length}</p><p className="text-xs text-gray-500 font-semibold">This Year</p></div>
                    <div className="text-center"><p className="text-2xl font-bold text-orange-600">{thisYear.reduce((s,l)=>s+days(l.fromDate,l.toDate),0)}</p><p className="text-xs text-gray-500 font-semibold">Days (Year)</p></div>
                  </div>
                </div>
              </div>
            )}

            {/* Edit profile form */}
            {editProfile&&isAdmin&&(
              <div className="bg-white rounded-2xl shadow p-6 border-l-4 border-teal-500">
                <h3 className="font-bold text-gray-800 mb-5 text-lg">👷 {hasProfile?"Edit":"Add"} Watchman Profile</h3>

                {/* Photo upload */}
                <div className="flex items-center gap-5 mb-6 p-4 bg-teal-50 rounded-xl border border-teal-200">
                  <div className="w-20 h-20 rounded-full ring-4 ring-teal-300 overflow-hidden bg-teal-600 flex items-center justify-center cursor-pointer flex-shrink-0" onClick={()=>photoRef.current?.click()}>
                    {draftWm.photo?<img src={draftWm.photo} alt="" className="w-full h-full object-cover"/>:<span className="text-3xl font-bold text-white">{(draftWm.name||"?")[0]?.toUpperCase()}</span>}
                  </div>
                  <input type="file" accept="image/*" className="hidden" ref={photoRef} onChange={e=>handlePhoto(e.target.files[0])}/>
                  <div>
                    <button onClick={()=>photoRef.current?.click()} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700">📷 Upload Photo</button>
                    {draftWm.photo&&<button onClick={()=>setDraftWm(d=>({...d,photo:""}))} className="ml-2 px-3 py-2 text-red-500 text-sm hover:text-red-700">Remove</button>}
                    <p className="text-xs text-gray-400 mt-1">Click the circle or button to upload</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Full Name *</label><input type="text" value={draftWm.name} onChange={e=>setDraftWm(d=>({...d,name:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Phone</label><input type="text" value={draftWm.phone} onChange={e=>setDraftWm(d=>({...d,phone:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Effective / Joining Date</label><input type="date" value={draftWm.joiningDate} onChange={e=>setDraftWm(d=>({...d,joiningDate:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Emergency Contact</label><input type="text" value={draftWm.emergencyContact} onChange={e=>setDraftWm(d=>({...d,emergencyContact:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Address</label><input type="text" value={draftWm.address} onChange={e=>setDraftWm(d=>({...d,address:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Spouse Name</label><input type="text" value={draftWm.spouseName} onChange={e=>setDraftWm(d=>({...d,spouseName:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Notes</label><input type="text" value={draftWm.notes} onChange={e=>setDraftWm(d=>({...d,notes:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                </div>

                {/* Children */}
                <div className="mb-4 p-4 bg-gray-50 rounded-xl border">
                  <label className="block text-xs font-bold text-gray-500 mb-2">Children</label>
                  <div className="flex flex-wrap gap-2 mb-2">{(draftWm.children||[]).map((c,i)=><span key={i} className="flex items-center gap-1 px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-semibold">👦 {c}<button onClick={()=>removeChild(i)} className="ml-1 text-red-400 hover:text-red-600 font-bold">×</button></span>)}</div>
                  <div className="flex gap-2"><input type="text" value={newChild} onChange={e=>setNewChild(e.target.value)} onKeyDown={e=>{if(e.key==="Enter") addChild();}} placeholder="Child's name..." className="flex-1 px-3 py-1.5 border rounded-lg text-sm"/><button onClick={addChild} className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-semibold">+ Add</button></div>
                </div>

                <div className="flex gap-3">
                  <button onClick={saveProfile} className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700">✓ Save Profile</button>
                  <button onClick={()=>setEditProfile(false)} className="px-6 py-2.5 bg-gray-400 text-white rounded-xl font-bold">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LEAVES TAB ── */}
        {tab==="leaves"&&(
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <MetricCard label="This Month" value={thisMonth.length} bg="bg-teal-50" borderColor="border-teal-500"/>
              <MetricCard label="This Year" value={thisYear.length} bg="bg-blue-50" borderColor="border-blue-400"/>
              <MetricCard label="Days (Year)" value={thisYear.reduce((s,l)=>s+days(l.fromDate,l.toDate),0)} bg="bg-orange-50" borderColor="border-orange-400"/>
            </div>
            {isAdmin&&<button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-semibold text-sm"><Plus size={16}/> Add Leave</button>}
            {showNew&&isAdmin&&(<div className="bg-white rounded-xl shadow p-6 border-l-4 border-teal-500"><div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4"><div><label className="block text-xs font-semibold text-gray-500 mb-1">Watchman Name *</label><input type="text" value={nf.watchmanName} onChange={e=>setNf({...nf,watchmanName:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Leave Type</label><select value={nf.leaveType} onChange={e=>setNf({...nf,leaveType:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{["Casual Leave","Sick Leave","Emergency Leave","Planned Leave","Absent (Unauthorized)"].map(t=><option key={t}>{t}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Reason</label><input type="text" value={nf.reason} onChange={e=>setNf({...nf,reason:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">From *</label><input type="date" value={nf.fromDate} onChange={e=>setNf({...nf,fromDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">To</label><input type="date" value={nf.toDate} onChange={e=>setNf({...nf,toDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Cover By</label><input type="text" value={nf.coverArrangement} onChange={e=>setNf({...nf,coverArrangement:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div></div><div className="flex gap-2"><button onClick={add} className="px-5 py-2 bg-teal-600 text-white rounded-lg font-semibold text-sm hover:bg-teal-700">Save</button><button onClick={()=>setShowNew(false)} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div></div>)}
            {leaves.length===0&&!showNew&&<div className="text-center py-16 text-gray-400"><p className="text-5xl mb-4">📋</p><p>No leave records yet</p></div>}
            {leaves.length>0&&(<div className="bg-white rounded-xl shadow overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Watchman</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">From</th><th className="px-4 py-3 text-left">To</th><th className="px-4 py-3 text-center">Days</th><th className="px-4 py-3 text-left">Reason</th><th className="px-4 py-3 text-center">Status</th>{isAdmin&&<th className="px-4 py-3"/>}</tr></thead><tbody>{leaves.map(l=>(<tr key={l.id} className="border-t hover:bg-gray-50"><td className="px-4 py-3 font-semibold">{l.watchmanName}</td><td className="px-4 py-3"><span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-semibold">{l.leaveType}</span></td><td className="px-4 py-3 text-xs">{fmtIndian(l.fromDate)}</td><td className="px-4 py-3 text-xs">{l.toDate?fmtIndian(l.toDate):"—"}</td><td className="px-4 py-3 text-center font-bold">{days(l.fromDate,l.toDate)}</td><td className="px-4 py-3 text-xs text-gray-500">{l.reason||"—"}</td><td className="px-4 py-3">{isAdmin?<select value={l.status||"Approved"} onChange={e=>upd(l.id,{status:e.target.value})} className={"text-xs font-semibold px-2 py-1 rounded border "+(l.status==="Approved"?"bg-green-100 text-green-700 border-green-300":l.status==="Pending"?"bg-yellow-100 text-yellow-700 border-yellow-300":"bg-red-100 text-red-700 border-red-300")}>{["Approved","Pending","Rejected"].map(s=><option key={s}>{s}</option>)}</select>:<span className={"text-xs font-semibold px-2 py-1 rounded "+(l.status==="Approved"?"bg-green-100 text-green-700":"bg-yellow-100 text-yellow-700")}>{l.status||"Approved"}</span>}</td>{isAdmin&&<td className="px-4 py-3"><button onClick={()=>del(l.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></td>}</tr>))}</tbody></table></div>)}
          </div>
        )}

        {/* ── PAST WATCHMEN TAB ── */}
        {tab==="past"&&(
          <div className="space-y-4">
            {pastWatchmen.length===0&&<div className="text-center py-16 text-gray-400"><span className="text-5xl">🕐</span><p className="mt-4">No past watchmen records yet.</p><p className="text-sm mt-1">When a watchman resigns, their full profile moves here.</p></div>}
            {pastWatchmen.map((pw,idx)=>(
              <div key={idx} className="bg-white rounded-2xl shadow overflow-hidden border-l-4 border-gray-400">
                <div className="bg-gray-100 p-5 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-400 flex items-center justify-center flex-shrink-0">
                    {pw.photo?<img src={pw.photo} alt={pw.name} className="w-full h-full object-cover"/>:<span className="text-2xl font-bold text-white">{(pw.name||"?")[0]?.toUpperCase()}</span>}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-800 text-lg">{pw.name||"—"}</h3>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                      {pw.joiningDate&&<span>📅 Joined: {fmtIndian(pw.joiningDate)}</span>}
                      {pw.resignDate&&<span>🚪 Resigned: <span className="text-red-600 font-semibold">{fmtIndian(pw.resignDate)}</span></span>}
                      {pw.phone&&<span>📞 {pw.phone}</span>}
                    </div>
                  </div>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    {pw.address&&<p className="text-sm text-gray-600 mb-1">🏠 {pw.address}</p>}
                    {pw.emergencyContact&&<p className="text-sm text-gray-600 mb-1">🆘 {pw.emergencyContact}</p>}
                    {pw.spouseName&&<p className="text-sm text-gray-600 mb-1">💑 Spouse: {pw.spouseName}</p>}
                    {(pw.children||[]).length>0&&<div className="flex flex-wrap gap-1 mt-1">{pw.children.map((c,i)=><span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">👦 {c}</span>)}</div>}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase mb-2">Leave History ({(pw.leaves||[]).length} records)</p>
                    {(pw.leaves||[]).length===0?<p className="text-xs text-gray-400 italic">No leave records</p>:(
                      <div className="space-y-1 max-h-32 overflow-y-auto">{(pw.leaves||[]).map((l,li)=><div key={li} className="flex items-center gap-2 text-xs text-gray-600"><span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-semibold">{l.leaveType?.split(" ")[0]}</span><span>{fmtIndian(l.fromDate)}</span><span className="text-gray-400">{l.reason||""}</span></div>)}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  );
}
function AuditPage({data, setData, setView, isAdmin, role, flats=[]}){
  const userRole = role || "admin";
  const [filter, setFilter] = useState("1y");
  const lastCalYear = TODAY.getFullYear()-1;

  const auditedPeriods = (data.auditedPeriods && data.auditedPeriods.length)
    ? data.auditedPeriods
    : [];
  const pendingAudit   = auditedPeriods.find(function(a){return a.status==="pending";}) || null;
  const approvedAudits = auditedPeriods.filter(function(a){return a.status==="approved";});
  const lastYearAudit  = auditedPeriods.find(function(a){return a.year===lastCalYear;}) || null;

  function initiateAudit(){
    if(userRole!=="auditor") return;
    if(lastYearAudit) return;
    if(!window.confirm("Initiate audit for "+lastCalYear+"? Once approved by admin, all "+lastCalYear+" records will be permanently frozen.")) return;
    setData(function(p){return{...p,auditedPeriods:[...(p.auditedPeriods||[]),{year:lastCalYear,status:"pending",initiatedBy:"auditor",initiatedAt:TODAY.toISOString()}]};});
  }
  function approveAudit(year){
    if(!isAdmin) return;
    if(!window.confirm("Approve and FREEZE all records for "+year+"? This cannot be undone.")) return;
    setData(function(p){return{...p,auditedPeriods:(p.auditedPeriods||[]).map(function(a){return a.year===year&&a.status==="pending"?{...a,status:"approved",approvedBy:"admin",approvedAt:TODAY.toISOString()}:a;})};});
  }
  function rejectAudit(year){
    if(!isAdmin) return;
    if(!window.confirm("Reject audit request for "+year+"?")) return;
    setData(function(p){return{...p,auditedPeriods:(p.auditedPeriods||[]).filter(function(a){return!(a.year===year&&a.status==="pending");})};});
  }

  function getFilteredData(){
    const now = new Date();
    let startDate, endDate = new Date();
    let startYear, startMonth, endYear, endMonth;
    if(filter === "3m") {
      startDate = new Date(now.getFullYear(), now.getMonth()-2, 1);
      startYear = startDate.getFullYear(); startMonth = startDate.getMonth();
      endYear = now.getFullYear(); endMonth = now.getMonth();
    } else if(filter === "6m") {
      startDate = new Date(now.getFullYear(), now.getMonth()-5, 1);
      startYear = startDate.getFullYear(); startMonth = startDate.getMonth();
      endYear = now.getFullYear(); endMonth = now.getMonth();
    } else if(filter === "1y") {
      startDate = new Date(now.getFullYear()-1, now.getMonth(), 1);
      startYear = startDate.getFullYear(); startMonth = startDate.getMonth();
      endYear = now.getFullYear(); endMonth = now.getMonth();
    } else if(filter === "lastyear") {
      startDate = new Date(now.getFullYear()-1, 0, 1);
      endDate = new Date(now.getFullYear()-1, 11, 31);
      startYear = now.getFullYear()-1; startMonth = 0;
      endYear = now.getFullYear()-1; endMonth = 11;
    } else {
      const year = parseInt(filter);
      startDate = new Date(year, 0, 1); endDate = new Date(year, 11, 31);
      startYear = year; startMonth = 0; endYear = year; endMonth = 11;
    }
    let collections = 0;
    flats.forEach(f => {
      for(let y = startYear; y <= endYear; y++) {
        const mStart = (y === startYear) ? startMonth : 0;
        const mEnd = (y === endYear) ? endMonth : 11;
        for(let m = mStart; m <= mEnd; m++) {
          const c = (data.collections[f] && data.collections[f][y+"-"+m]) || {amount: 5000, paid: false, advance: false};
          if(c.paid && !c.advance) collections += c.amount;
        }
      }
    });
    if(data.specialCollections) {
      data.specialCollections.forEach(sc => {
        sc.entries.forEach(e => {
          if(e.paid && e.paidDate) {
            const d = new Date(e.paidDate);
            const y = d.getFullYear(); const m = d.getMonth();
            if(y >= startYear && y <= endYear && (y !== startYear || m >= startMonth) && (y !== endYear || m <= endMonth)) {
              collections += parseFloat(e.amount || 0);
            }
          }
        });
      });
    }
    const expenses = data.expenses.filter(e => {
      return e.year >= startYear && e.year <= endYear && (e.year !== startYear || e.month >= startMonth) && (e.year !== endYear || e.month <= endMonth);
    }).reduce((s, e) => s + e.amount, 0);
    let carryForward = 142799;
    const previousMonths = [];
    for(let y = START_YEAR; y < startYear; y++) { for(let m = 0; m < 12; m++) { previousMonths.push({year: y, month: m}); } }
    for(let m = 0; m < startMonth; m++) { previousMonths.push({year: startYear, month: m}); }
    previousMonths.forEach(({year: y, month: m}) => {
      let maint = 0;
      flats.forEach(f => { const c = (data.collections[f] && data.collections[f][y+"-"+m]) || {amount: 5000, paid: false, advance: false}; if(c.paid && !c.advance) maint += c.amount; });
      const special = data.specialCollections ? data.specialCollections.reduce((sum, sc) => { return sum + sc.entries.filter(e => e.paid && e.paidDate && new Date(e.paidDate).getFullYear() === y && new Date(e.paidDate).getMonth() === m).reduce((s, e) => s + parseFloat(e.amount || 0), 0); }, 0) : 0;
      const exp = data.expenses.filter(e => e.year === y && e.month === m).reduce((s, e) => s + e.amount, 0);
      carryForward += (maint + special - exp);
    });
    let dues = 0;
    flats.forEach(f => { const p = getFlatPending(f); dues += p.overdue; });
    const netBalance = carryForward + collections - expenses;
    return { collections, expenses, dues, carryForward, netBalance, startDate: fmtIndian(startDate.toISOString().split("T")[0]), endDate: fmtIndian(endDate.toISOString().split("T")[0]) };
  }
  function getFlatPending(flat){
    let overdue = 0;
    YEARS.forEach(y => MONTHS.forEach((_, m) => {
      const c = (data.collections[flat] && data.collections[flat][y+"-"+m]) || {amount: 5000, paid: false};
      if(!c.paid && isPast(y, m)) overdue += c.amount;
    }));
    return { overdue };
  }

  const auditData = getFilteredData();
  const net = auditData.netBalance;
  const filterOpts = [["1y", "Last 1 Year"], ["6m", "Last 6 Months"], ["3m", "Last 3 Months"], ["lastyear", "Last Calendar Year"], ...YEARS.map(y => [String(y), String(y)])];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6">
        <button onClick={() => setView("dashboard")} className="text-indigo-100 hover:text-white mb-2 font-semibold text-sm">← Dashboard</button>
        <h1 className="text-3xl font-bold">📋 Audit Report</h1>
      </header>
      <NavBar view="audit" setView={setView}/>
      <main className="max-w-7xl mx-auto px-6 py-8">

        <div className="bg-white rounded-lg shadow p-6 mb-6 border-l-4 border-indigo-500">
          <h3 className="font-bold text-lg mb-4">🔐 Audit Management</h3>
          {approvedAudits.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-bold text-gray-500 mb-2">FROZEN YEARS (Approved Audits)</p>
              <div className="flex flex-wrap gap-2">
                {approvedAudits.map(function(a){ return (
                  <span key={a.year} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 text-indigo-800 rounded-full text-xs font-bold border border-indigo-300">
                    {"🔒 "+a.year+" — Frozen"}
                    {a.approvedAt && <span className="text-indigo-500 font-normal">{"· "+new Date(a.approvedAt).toLocaleDateString("en-IN")}</span>}
                  </span>
                ); })}
              </div>
            </div>
          )}
          {pendingAudit && (
            <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-xl mb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-yellow-800">{"⏳ Pending Audit — "+pendingAudit.year}</p>
                  <p className="text-xs text-yellow-700 mt-0.5">{"Initiated by Auditor on "+new Date(pendingAudit.initiatedAt||"").toLocaleDateString("en-IN")+". Awaiting Admin approval."}</p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button onClick={function(){approveAudit(pendingAudit.year);}} className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700">Approve and Freeze</button>
                    <button onClick={function(){rejectAudit(pendingAudit.year);}} className="px-4 py-2 bg-red-500 text-white rounded-lg font-bold text-sm hover:bg-red-600">Reject</button>
                  </div>
                )}
                {!isAdmin && <span className="text-xs text-yellow-600 font-semibold">Waiting for Admin approval</span>}
              </div>
            </div>
          )}
          {userRole === "auditor" && !lastYearAudit && !pendingAudit && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-sm text-blue-800 mb-2">{"Ready to audit "+lastCalYear+" (last calendar year). Once admin approves, all "+lastCalYear+" records will be read-only."}</p>
              <button onClick={initiateAudit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700">{"📋 Initiate Audit for "+lastCalYear}</button>
            </div>
          )}
          {userRole === "auditor" && lastYearAudit && lastYearAudit.status === "approved" && (
            <p className="text-sm text-green-700 font-semibold">{"✅ "+lastCalYear+" has been audited and frozen."}</p>
          )}
          {userRole !== "auditor" && !isAdmin && approvedAudits.length === 0 && !pendingAudit && (
            <p className="text-xs text-gray-400">No audits initiated yet. Only Auditors can initiate and Admins can approve.</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-bold mb-4">Select Period</h3>
          <div className="flex flex-wrap gap-2">
            {filterOpts.map(([val, lbl]) => (
              <button key={val} onClick={() => setFilter(val)} className={"px-4 py-2 rounded-lg text-sm font-bold transition " + (filter === val ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <p className="text-gray-500 text-xs font-bold mb-2">COLLECTIONS</p>
            <p className="text-3xl font-bold text-green-700">{"₹"+auditData.collections.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <p className="text-gray-500 text-xs font-bold mb-2">EXPENSES</p>
            <p className="text-3xl font-bold text-red-700">{"₹"+auditData.expenses.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-orange-500">
            <p className="text-gray-500 text-xs font-bold mb-2">OUTSTANDING DUES</p>
            <p className="text-3xl font-bold text-orange-700">{"₹"+auditData.dues.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
            <p className="text-gray-500 text-xs font-bold mb-2">OPENING BALANCE</p>
            <p className="text-3xl font-bold text-purple-700">{"₹"+auditData.carryForward.toLocaleString()}</p>
          </div>
          <div className={"bg-white rounded-lg shadow p-6 border-l-4 " + (net >= 0 ? "border-blue-500" : "border-red-500")}>
            <p className="text-gray-500 text-xs font-bold mb-2">NET BALANCE</p>
            <p className={"text-3xl font-bold " + (net >= 0 ? "text-blue-700" : "text-red-700")}>{"₹"+net.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-bold text-lg mb-4">{"Period: "+auditData.startDate+" to "+auditData.endDate}</h3>
          <div className="space-y-4">
            <div className="border-b pb-4">
              <p className="font-bold text-purple-700 mb-2">Opening Balance (Carry Forward)</p>
              <p className="text-2xl font-bold text-gray-800">{"₹"+auditData.carryForward.toLocaleString()}</p>
            </div>
            <div className="border-b pb-4">
              <p className="font-bold text-green-700 mb-2">Collections (Period)</p>
              <p className="text-2xl font-bold text-gray-800">{"+ ₹"+auditData.collections.toLocaleString()}</p>
            </div>
            <div className="border-b pb-4">
              <p className="font-bold text-red-700 mb-2">Expenses (Period)</p>
              <p className="text-2xl font-bold text-gray-800">{"- ₹"+auditData.expenses.toLocaleString()}</p>
            </div>
            <div className="border-b pb-4">
              <p className="font-bold text-orange-700 mb-2">Outstanding Dues</p>
              <p className="text-2xl font-bold text-gray-800">{"₹"+auditData.dues.toLocaleString()}</p>
            </div>
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4">
              <p className="text-gray-600 text-sm mb-2">Closing Balance (Opening + Collections - Expenses)</p>
              <p className={"text-4xl font-bold "+(net >= 0 ? "text-green-700" : "text-red-700")}>{(net >= 0 ? "+" : "")+"₹"+net.toLocaleString()}</p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
function SpecialPage({data,setData,setView,navView,isAdmin,role="admin",flats=[]}){
  const [showNew,setShowNew]=useState(false);
  const [selId,setSelId]=useState(null);
  const [nf,setNf]=useState({year:TODAY.getFullYear()<START_YEAR?START_YEAR:TODAY.getFullYear(),month:TODAY.getMonth(),title:"",purpose:"",targetAmount:"",notes:""});

  function addCollection(){
    if(!nf.title.trim()) return;
    const sc={id:Date.now().toString(),...nf,targetAmount:parseFloat(nf.targetAmount)||0,
      entries:flats.map(f=>({flatNum:f,amount:0,paid:false,paidDate:"",method:"Cash",note:"",receivedFrom:"",receivedDate:TODAY.toISOString().split("T")[0]}))
    };
    setData(p=>({...p,specialCollections:[...(p.specialCollections||[]),sc]}));
    setShowNew(false);setSelId(sc.id);
    setNf({year:TODAY.getFullYear()<START_YEAR?START_YEAR:TODAY.getFullYear(),month:TODAY.getMonth(),title:"",purpose:"",targetAmount:"",notes:""});
  }
  function del(id){if(!window.confirm("Delete?")) return;setData(p=>({...p,specialCollections:(p.specialCollections||[]).filter(s=>s.id!==id)}));if(selId===id) setSelId(null);}
  function updEntry(scid,flatNum,upd){setData(p=>({...p,specialCollections:(p.specialCollections||[]).map(sc=>sc.id===scid?{...sc,entries:sc.entries.map(e=>e.flatNum===flatNum?{...e,...upd}:e)}:sc)}));}
  function updSc(scid,upd){setData(p=>({...p,specialCollections:(p.specialCollections||[]).map(sc=>sc.id===scid?{...sc,...upd}:sc)}));}

  const scs=data.specialCollections||[];
  const sel=selId?scs.find(s=>s.id===selId):null;

  if(sel){
    const paid=sel.entries.filter(e=>e.paid);
    const total=paid.reduce((s,e)=>s+parseFloat(e.amount||0),0);
    const pct=sel.targetAmount?Math.round(total/sel.targetAmount*100):0;
    return(
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6">
          <button onClick={()=>setSelId(null)} className="text-purple-100 hover:text-white mb-2 font-semibold text-sm">← All Special Collections</button>
          <h1 className="text-2xl font-bold">{sel.title}</h1>
        </header>
        <NavBar view={navView} setView={setView} role={role}/>
        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="bg-white rounded-xl shadow p-5">
            <div className="flex justify-between items-center mb-2"><h3 className="font-bold">Collection Progress</h3><span className="text-sm font-semibold text-gray-600">{paid.length}/{sel.entries.length} flats paid</span></div>
            {sel.targetAmount>0&&<><div className="flex justify-between text-xs text-gray-500 mb-1"><span>Collected: ₹{total.toLocaleString()}</span><span>Target: ₹{sel.targetAmount.toLocaleString()} ({pct}%)</span></div><div className="w-full bg-gray-200 rounded-full h-3 mb-3"><div className="bg-purple-500 h-3 rounded-full" style={{width:Math.min(pct,100)+"%"}}></div></div></>}
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Total Collected" value={"₹"+total.toLocaleString()} bg="bg-purple-50" borderColor="border-purple-500"/>
              <MetricCard label="Flats Paid" value={paid.length} bg="bg-green-50" borderColor="border-green-500"/>
              <MetricCard label="Pending" value={sel.entries.length-paid.length} bg="bg-orange-50" borderColor="border-orange-400"/>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-3 py-3 text-left">Flat</th><th className="px-3 py-3 text-left">Resident</th><th className="px-3 py-3 text-center">Amount (₹)</th><th className="px-3 py-3 text-center">Status</th><th className="px-3 py-3 text-left">Date</th><th className="px-3 py-3 text-left">Mode</th><th className="px-3 py-3 text-left">Note</th></tr></thead>
              <tbody>{sel.entries.map(e=>{const fd=data.flats?.[e.flatNum];if(!fd) return null;const name=fd.currentTenant?fd.currentTenant.name:fd.ownerName;return(<tr key={e.flatNum} className={"border-t "+(e.paid?"bg-green-50":"hover:bg-gray-50")}><td className="px-3 py-2 font-bold text-blue-600">{e.flatNum}</td><td className="px-3 py-2 text-gray-600 text-xs">{name}</td><td className="px-3 py-2 text-center">{isAdmin?<input type="number" value={e.amount||""} onChange={ev=>updEntry(sel.id,e.flatNum,{amount:parseFloat(ev.target.value)||0})} className="w-20 px-2 py-1 border rounded text-sm text-center font-semibold"/>:<span className="font-semibold">₹{e.amount||0}</span>}</td><td className="px-3 py-2 text-center">{isAdmin?<button onClick={()=>updEntry(sel.id,e.flatNum,{paid:!e.paid,paidDate:!e.paid?TODAY.toISOString().split("T")[0]:""})} className={"px-3 py-1 rounded text-xs font-bold "+(e.paid?"bg-green-100 text-green-700":"bg-orange-100 text-orange-600")}>{e.paid?"✓ Paid":"Pending"}</button>:<span className={"px-2 py-1 rounded text-xs font-bold "+(e.paid?"bg-green-100 text-green-700":"bg-orange-100 text-orange-600")}>{e.paid?"✓ Paid":"Pending"}</span>}</td><td className="px-3 py-2 text-xs">{isAdmin?<input type="date" value={e.paidDate||""} onChange={ev=>updEntry(sel.id,e.flatNum,{paidDate:ev.target.value})} className="px-2 py-1 border rounded text-xs w-32"/>:e.paidDate||"—"}</td><td className="px-3 py-2">{isAdmin?<select value={e.method||"Cash"} onChange={ev=>updEntry(sel.id,e.flatNum,{method:ev.target.value})} className="px-2 py-1 border rounded text-xs">{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select>:<span className="text-xs">{e.method||"Cash"}</span>}</td><td className="px-3 py-2">{isAdmin?<input type="text" value={e.note||""} onChange={ev=>updEntry(sel.id,e.flatNum,{note:ev.target.value})} placeholder="Note..." className="px-2 py-1 border rounded text-xs w-28"/>:<span className="text-xs text-gray-500">{e.note||"—"}</span>}</td></tr>);})}</tbody>
              <tfoot className="bg-gray-50 border-t-2"><tr><td colSpan={2} className="px-3 py-3 font-bold">Total</td><td className="px-3 py-3 text-center font-bold text-purple-700">₹{total.toLocaleString()}</td><td colSpan={4}></td></tr></tfoot>
            </table>
          </div>
        </main>
      </div>
    );
  }

  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6"><h1 className="text-3xl font-bold">🎯 Special Collections</h1></header>
      <NavBar view={navView} setView={setView} role={role}/>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {isAdmin&&<button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold text-sm"><Plus size={16}/> New Special Collection</button>}
        {showNew&&isAdmin&&(
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-purple-500">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label><input type="text" value={nf.title} onChange={e=>setNf({...nf,title:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 mb-1">Purpose</label><input type="text" value={nf.purpose} onChange={e=>setNf({...nf,purpose:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Target (₹)</label><input type="number" value={nf.targetAmount} onChange={e=>setNf({...nf,targetAmount:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            </div>
            <div className="flex gap-2"><button onClick={addCollection} className="px-5 py-2 bg-purple-600 text-white rounded-lg font-semibold text-sm hover:bg-purple-700">Create</button><button onClick={()=>setShowNew(false)} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div>
          </div>
        )}
        {scs.length===0&&!showNew&&<div className="text-center py-16 text-gray-400"><p className="text-5xl mb-4">🎯</p><p>No special collections yet</p></div>}
        {scs.map(sc=>{
          const paid=sc.entries.filter(e=>e.paid);const total=paid.reduce((s,e)=>s+parseFloat(e.amount||0),0);
          return(
            <div key={sc.id} className="bg-white rounded-xl shadow hover:shadow-md transition overflow-hidden cursor-pointer" onClick={()=>setSelId(sc.id)}>
              <div className="p-5">
                <div className="flex justify-between items-start"><div><h3 className="font-bold text-gray-800">{sc.title}</h3><p className="text-xs text-gray-500 mt-0.5">{sc.purpose}</p></div>{isAdmin&&<button onClick={e=>{e.stopPropagation();del(sc.id);}} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={15}/></button>}</div>
                <div className="mt-3 flex gap-4 text-sm"><span className="font-bold text-purple-700">₹{total.toLocaleString()} collected</span><span className="text-gray-500">{paid.length}/{sc.entries.length} flats</span></div>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// VENDOR MANAGEMENT PAGE
// ══════════════════════════════════════════════════════════
const SERVICE_TYPES = ["Electrician","Plumber","Lift Maintenance","Water Tanker","Pest Control","Security Agency","CCTV","Painter","Carpenter","Other"];
const CONTRACT_TYPES = ["AMC","On-Call","Monthly Retainer","One-Time"];

function VendorsPage({db, projectId, setView, navView, isAdmin, role}){
  const vendorCol = () => projectId ? collection(db,"projects",projectId,"vendors") : collection(db,"vendors");
  const vendorDoc = (id) => projectId ? doc(db,"projects",projectId,"vendors",id) : doc(db,"vendors",id);

  const [vendors,setVendors]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const [search,setSearch]=useState("");
  const [filterType,setFilterType]=useState("All");
  const emptyVendor={name:"",serviceType:"Electrician",phone:"",email:"",contractType:"AMC",notes:"",lastServiceDate:"",nextServiceDate:""};
  const [form,setForm]=useState(emptyVendor);

  useEffect(()=>{
    async function load(){
      try{
        const snap=await getDocs(vendorCol());
        setVendors(snap.docs.map(d=>({id:d.id,...d.data()})));
      }catch(e){console.error(e);}
      setLoading(false);
    }
    load();
  },[projectId]);

  async function saveVendor(){
    if(!form.name.trim()||!form.phone.trim()) return alert("Name and phone are required.");
    try{
      if(editing){
        await updateDoc(vendorDoc(editing),form);
        setVendors(vs=>vs.map(v=>v.id===editing?{id:editing,...form}:v));
      } else {
        const ref=await addDoc(vendorCol(),{...form,createdAt:new Date().toISOString()});
        setVendors(vs=>[...vs,{id:ref.id,...form,createdAt:new Date().toISOString()}]);
      }
      setShowForm(false);setEditing(null);setForm(emptyVendor);
    }catch(e){alert("Error saving vendor: "+e.message);}
  }

  async function deleteVendor(id){
    if(!window.confirm("Delete this vendor?")) return;
    try{
      await deleteDoc(vendorDoc(id));
      setVendors(vs=>vs.filter(v=>v.id!==id));
    }catch(e){alert("Error: "+e.message);}
  }

  const filtered=vendors.filter(v=>{
    const matchSearch=v.name.toLowerCase().includes(search.toLowerCase())||v.phone.includes(search);
    const matchType=filterType==="All"||v.serviceType===filterType;
    return matchSearch&&matchType;
  });

  const serviceColor={"Electrician":"bg-yellow-100 text-yellow-800","Plumber":"bg-blue-100 text-blue-800","Lift Maintenance":"bg-purple-100 text-purple-800","Water Tanker":"bg-cyan-100 text-cyan-800","Pest Control":"bg-red-100 text-red-800","Security Agency":"bg-gray-100 text-gray-800"};

  if(loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-teal-600 to-teal-700 text-white p-6">
        <h1 className="text-3xl font-bold">🔧 Vendor Directory</h1>
        <p className="text-teal-100 text-sm mt-1">{vendors.length} vendors registered</p>
      </header>
      <NavBar view={navView} setView={setView} role={role}/>
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-5">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-3 flex-1 flex-wrap">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vendors..." className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-48"/>
            <select value={filterType} onChange={e=>setFilterType(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="All">All Services</option>
              {SERVICE_TYPES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {isAdmin&&<button onClick={()=>{setShowForm(true);setEditing(null);setForm(emptyVendor);}} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg font-semibold text-sm hover:bg-teal-700"><Plus size={15}/> Add Vendor</button>}
        </div>

        {showForm&&isAdmin&&(
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-teal-500">
            <h3 className="font-bold text-gray-800 mb-4">{editing?"Edit Vendor":"New Vendor"}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[["Vendor Name *","name","text"],["Phone *","phone","text"],["Email","email","email"]].map(([label,field,type])=>(
                <div key={field}><label className="block text-xs font-bold text-gray-500 mb-1">{label}</label><input type={type} value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              ))}
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Service Type</label><select value={form.serviceType} onChange={e=>setForm({...form,serviceType:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{SERVICE_TYPES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Contract Type</label><select value={form.contractType} onChange={e=>setForm({...form,contractType:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{CONTRACT_TYPES.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Last Service</label><input type="date" value={form.lastServiceDate} onChange={e=>setForm({...form,lastServiceDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Next Service Due</label><input type="date" value={form.nextServiceDate} onChange={e=>setForm({...form,nextServiceDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Notes</label><input type="text" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Any additional notes..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={saveVendor} className="px-5 py-2 bg-teal-600 text-white rounded-lg font-semibold text-sm hover:bg-teal-700">✓ Save</button>
              <button onClick={()=>{setShowForm(false);setEditing(null);setForm(emptyVendor);}} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button>
            </div>
          </div>
        )}

        {filtered.length===0&&<div className="text-center py-16 text-gray-400"><Wrench size={48} className="mx-auto mb-4 opacity-30"/><p className="text-lg">No vendors found</p></div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(v=>(
            <div key={v.id} className="bg-white rounded-xl shadow hover:shadow-md transition p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">{v.name}</h3>
                  <span className={"text-xs font-semibold px-2 py-0.5 rounded-full "+(serviceColor[v.serviceType]||"bg-gray-100 text-gray-700")}>{v.serviceType}</span>
                </div>
                {isAdmin&&<div className="flex gap-1">
                  <button onClick={()=>{setEditing(v.id);setForm({name:v.name,serviceType:v.serviceType,phone:v.phone,email:v.email||"",contractType:v.contractType||"AMC",notes:v.notes||"",lastServiceDate:v.lastServiceDate||"",nextServiceDate:v.nextServiceDate||""});setShowForm(true);}} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={14}/></button>
                  <button onClick={()=>deleteVendor(v.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14}/></button>
                </div>}
              </div>
              <div className="space-y-1.5 text-sm text-gray-600">
                <p className="flex items-center gap-2"><Phone size={13} className="text-gray-400"/>{v.phone}</p>
                {v.email&&<p className="flex items-center gap-2"><Mail size={13} className="text-gray-400"/>{v.email}</p>}
                <p className="flex items-center gap-2"><Tag size={13} className="text-gray-400"/>{v.contractType||"AMC"}</p>
                {v.lastServiceDate&&<p className="text-xs text-gray-400">Last service: {fmtIndian(v.lastServiceDate)}</p>}
                {v.nextServiceDate&&<p className={"text-xs font-semibold "+(new Date(v.nextServiceDate)<new Date()?"text-red-500":"text-green-600")}>Next: {fmtIndian(v.nextServiceDate)}{new Date(v.nextServiceDate)<new Date()?" ⚠️ OVERDUE":""}</p>}
                {v.notes&&<p className="text-xs text-gray-400 italic mt-2">{v.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// COMPLAINT TICKET SYSTEM
// ══════════════════════════════════════════════════════════
const COMPLAINT_CATEGORIES=["Plumbing","Electrical","Security","Cleaning","Lift","Common Area","Noise","Other"];
const COMPLAINT_STATUSES=["Open","In Progress","Resolved","Closed"];
const COMPLAINT_PRIORITIES=["Low","Medium","High","Urgent"];
const STATUS_COLORS={"Open":"bg-red-100 text-red-700 border-red-200","In Progress":"bg-yellow-100 text-yellow-700 border-yellow-200","Resolved":"bg-green-100 text-green-700 border-green-200","Closed":"bg-gray-100 text-gray-600 border-gray-200"};
const PRIORITY_COLORS={"Low":"bg-gray-100 text-gray-600","Medium":"bg-blue-100 text-blue-700","High":"bg-orange-100 text-orange-700","Urgent":"bg-red-100 text-red-700 font-bold"};

function ComplaintsPage({db, projectId, setView, navView, isAdmin, role, flatNumber, currentUser}){
  const complaintCol = () => projectId ? collection(db,"projects",projectId,"complaints") : collection(db,"complaints");
  const complaintDoc = (id) => projectId ? doc(db,"projects",projectId,"complaints",id) : doc(db,"complaints",id);
  const vendorCol    = () => projectId ? collection(db,"projects",projectId,"vendors")   : collection(db,"vendors");

  const [complaints,setComplaints]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selId,setSelId]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [filterStatus,setFilterStatus]=useState("All");
  const [filterCat,setFilterCat]=useState("All");
  const [updateText,setUpdateText]=useState("");
  const [newComplaint,setNewComplaint]=useState({flatNumber:flatNumber||"",title:"",description:"",category:"Plumbing",priority:"Medium"});
  const [vendors,setVendors]=useState([]);

  useEffect(()=>{
    async function load(){
      try{
        const snap=await getDocs(complaintCol());
        setComplaints(snap.docs.map(d=>({id:d.id,...d.data()})));
        const vsnap=await getDocs(vendorCol());
        setVendors(vsnap.docs.map(d=>({id:d.id,...d.data()})));
      }catch(e){console.error(e);}
      setLoading(false);
    }
    load();
  },[projectId]);

  async function submitComplaint(){
    if(!newComplaint.title.trim()||!newComplaint.flatNumber) return alert("Flat number and title are required.");
    const c={...newComplaint,status:"Open",createdBy:currentUser||"Admin",createdAt:new Date().toISOString(),updates:[]};
    try{
      const ref=await addDoc(complaintCol(),c);
      setComplaints(cs=>[...cs,{id:ref.id,...c}]);
      setShowNew(false);setNewComplaint({flatNumber:flatNumber||"",title:"",description:"",category:"Plumbing",priority:"Medium"});
    }catch(e){alert("Error: "+e.message);}
  }

  async function updateStatus(id,status,vendor=""){
    const upd={status,assignedVendor:vendor};
    try{
      await updateDoc(complaintDoc(id),upd);
      setComplaints(cs=>cs.map(c=>c.id===id?{...c,...upd}:c));
    }catch(e){alert("Error: "+e.message);}
  }

  async function addUpdate(id){
    if(!updateText.trim()) return;
    const update={text:updateText,date:new Date().toISOString(),by:currentUser||"Admin"};
    const complaint=complaints.find(c=>c.id===id);
    const updates=[...(complaint.updates||[]),update];
    try{
      await updateDoc(complaintDoc(id),{updates});
      setComplaints(cs=>cs.map(c=>c.id===id?{...c,updates}:c));
      setUpdateText("");
    }catch(e){alert("Error: "+e.message);}
  }

  async function deleteComplaint(id){
    if(!window.confirm("Delete this complaint?")) return;
    try{
      await deleteDoc(complaintDoc(id));
      setComplaints(cs=>cs.filter(c=>c.id!==id));
      if(selId===id) setSelId(null);
    }catch(e){alert("Error: "+e.message);}
  }

  const visibleComplaints=role==="resident"?complaints.filter(c=>String(c.flatNumber)===String(flatNumber)):complaints;
  const filtered=visibleComplaints.filter(c=>{
    const ms=filterStatus==="All"||c.status===filterStatus;
    const mc=filterCat==="All"||c.category===filterCat;
    return ms&&mc;
  }).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

  const openCount=visibleComplaints.filter(c=>c.status==="Open").length;
  const resolvedCount=visibleComplaints.filter(c=>c.status==="Resolved"||c.status==="Closed").length;
  const inProgressCount=visibleComplaints.filter(c=>c.status==="In Progress").length;

  const sel=selId?complaints.find(c=>c.id===selId):null;

  if(loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  if(sel){
    return(
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6">
          <button onClick={()=>setSelId(null)} className="text-orange-100 hover:text-white mb-2 font-semibold text-sm">← All Complaints</button>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div><h1 className="text-2xl font-bold">{sel.title}</h1><p className="text-orange-100 text-sm mt-1">Flat {sel.flatNumber} · {sel.category} · {fmtIndian(sel.createdAt?.split("T")[0])}</p></div>
            <div className="flex gap-2 flex-wrap">
              <span className={"px-3 py-1 rounded-full text-xs font-bold border "+(STATUS_COLORS[sel.status]||"bg-gray-100")}>{sel.status}</span>
              <span className={"px-2 py-1 rounded-full text-xs font-semibold "+(PRIORITY_COLORS[sel.priority]||"bg-gray-100")}>{sel.priority}</span>
            </div>
          </div>
        </header>
        <NavBar view={navView} setView={setView} role={role}/>
        <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-bold mb-2 text-gray-700">Description</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{sel.description||"No description provided."}</p>
          </div>

          {isAdmin&&(
            <div className="bg-white rounded-xl shadow p-5 space-y-4">
              <h3 className="font-bold text-gray-700">Admin Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Update Status</label>
                  <select value={sel.status} onChange={e=>updateStatus(sel.id,e.target.value,sel.assignedVendor||"")} className="w-full px-3 py-2 border rounded-lg text-sm font-semibold">
                    {COMPLAINT_STATUSES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Assign Vendor</label>
                  <select value={sel.assignedVendor||""} onChange={e=>updateStatus(sel.id,sel.status,e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">— No vendor —</option>
                    {vendors.filter(v=>v.serviceType===sel.category||sel.category==="Other").map(v=><option key={v.id} value={v.name}>{v.name} ({v.serviceType})</option>)}
                    {vendors.map(v=><option key={"all-"+v.id} value={v.name}>{v.name} ({v.serviceType})</option>)}
                  </select>
                </div>
              </div>
              {sel.assignedVendor&&<div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm"><p className="font-semibold text-blue-700">👷 Assigned to: {sel.assignedVendor}</p></div>}
            </div>
          )}

          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-bold mb-4 text-gray-700">Updates & Comments ({(sel.updates||[]).length})</h3>
            <div className="space-y-3 mb-4">
              {(sel.updates||[]).length===0&&<p className="text-gray-400 text-sm text-center py-4">No updates yet</p>}
              {(sel.updates||[]).map((u,i)=>(
                <div key={i} className="bg-gray-50 border rounded-lg p-3">
                  <p className="text-sm text-gray-700">{u.text}</p>
                  <p className="text-xs text-gray-400 mt-1">{u.by} · {fmtIndian(u.date?.split("T")[0])}</p>
                </div>
              ))}
            </div>
            {sel.status!=="Closed"&&(
              <div className="flex gap-2">
                <input value={updateText} onChange={e=>setUpdateText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addUpdate(sel.id)} placeholder="Add a comment or update..." className="flex-1 px-3 py-2 border rounded-lg text-sm"/>
                <button onClick={()=>addUpdate(sel.id)} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600">Post</button>
              </div>
            )}
          </div>

          {isAdmin&&<button onClick={()=>deleteComplaint(sel.id)} className="text-xs text-red-500 hover:text-red-700 font-semibold">🗑 Delete Complaint</button>}
        </main>
      </div>
    );
  }

  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-orange-500 to-amber-600 text-white px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">🎫 Complaints</h1>
            <p className="text-orange-100 text-xs mt-0.5">{openCount} open · {inProgressCount} in progress · {resolvedCount} resolved</p>
          </div>
          <button onClick={()=>setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-white text-orange-600 rounded-xl font-bold text-sm hover:bg-orange-50 shadow transition"><Plus size={14}/> New Complaint</button>
        </div>
      </header>
      <NavBar view={navView} setView={setView} role={role}/>
      <main className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        {/* Quick filter chips */}
        <div className="flex flex-wrap gap-2 items-center bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-2.5">
          <span className="text-xs font-bold text-gray-400 mr-1">Status:</span>
          {["All",...COMPLAINT_STATUSES].map(s=>(
            <button key={s} onClick={()=>setFilterStatus(s)} className={"px-2.5 py-1 rounded-lg text-xs font-semibold transition "+(filterStatus===s?"bg-orange-500 text-white":"bg-gray-100 text-gray-500 hover:bg-gray-200")}>{s}</button>
          ))}
          <span className="text-xs font-bold text-gray-400 ml-3 mr-1">Cat:</span>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} className="px-2 py-1 border rounded-lg text-xs font-semibold text-gray-600 bg-gray-50">
            <option value="All">All</option>
            {COMPLAINT_CATEGORIES.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>

        {showNew&&(
          <div className="bg-white rounded-2xl shadow-md border border-orange-100 p-5">
            <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-gray-800">File New Complaint</h3><button onClick={()=>setShowNew(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Flat Number *</label><input type="text" value={newComplaint.flatNumber} onChange={e=>setNewComplaint({...newComplaint,flatNumber:e.target.value})} placeholder="e.g. 302" disabled={role==="resident"} className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"/></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Category</label><select value={newComplaint.category} onChange={e=>setNewComplaint({...newComplaint,category:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{COMPLAINT_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
              <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Title *</label><input type="text" value={newComplaint.title} onChange={e=>setNewComplaint({...newComplaint,title:e.target.value})} placeholder="Brief summary of the issue" className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Description</label><textarea value={newComplaint.description} onChange={e=>setNewComplaint({...newComplaint,description:e.target.value})} rows={3} placeholder="Describe the issue in detail..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Priority</label><select value={newComplaint.priority} onChange={e=>setNewComplaint({...newComplaint,priority:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{COMPLAINT_PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div>
            </div>
            <div className="flex gap-3 mt-4"><button onClick={submitComplaint} className="px-5 py-2.5 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600">Submit</button><button onClick={()=>setShowNew(false)} className="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm">Cancel</button></div>
          </div>
        )}

        {filtered.length===0&&<div className="text-center py-16 text-gray-300"><AlertCircle size={48} className="mx-auto mb-4 opacity-30"/><p className="text-gray-400">No complaints found</p></div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(c=>{
            const CAT_ICON={"Plumbing":"🔧","Electrical":"⚡","Security":"🔒","Cleaning":"🧹","Lift":"🛗","Common Area":"🏢","Noise":"🔊","Other":"📋"};
            return(
              <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-orange-200 transition cursor-pointer flex flex-col" onClick={()=>setSelId(c.id)}>
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{CAT_ICON[c.category]||"📋"}</span>
                      <div>
                        <span className="font-bold text-blue-600 text-xs">Flat {c.flatNumber}</span>
                        <span className="text-gray-400 text-xs mx-1">·</span>
                        <span className="text-xs text-gray-500">{c.category}</span>
                      </div>
                    </div>
                    <span className={"px-2.5 py-1 rounded-full text-xs font-bold border flex-shrink-0 "+(STATUS_COLORS[c.status]||"bg-gray-100")}>{c.status}</span>
                  </div>
                  <h3 className="font-semibold text-gray-800 text-sm leading-tight">{c.title}</h3>
                  {c.description&&<p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{c.description}</p>}
                </div>
                <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50 rounded-b-2xl flex items-center gap-2 text-xs text-gray-400">
                  <span className={"px-2 py-0.5 rounded-full font-semibold "+(PRIORITY_COLORS[c.priority]||"")}>{c.priority}</span>
                  {c.assignedVendor&&<span className="text-teal-600 font-semibold">👷 {c.assignedVendor}</span>}
                  {(c.updates||[]).length>0&&<span className="text-blue-400">💬 {c.updates.length}</span>}
                  <span className="ml-auto">{fmtIndian(c.createdAt?.split("T")[0])}</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// SMS + NOTIFICATION SYSTEM
// ══════════════════════════════════════════════════════════
const NOTIF_TYPES=[{value:"maintenance_due",label:"💰 Maintenance Due",color:"bg-red-50 border-red-200",badge:"bg-red-100 text-red-700"},{value:"meeting_reminder",label:"📋 Meeting Reminder",color:"bg-blue-50 border-blue-200",badge:"bg-blue-100 text-blue-700"},{value:"notice",label:"📢 Notice",color:"bg-yellow-50 border-yellow-200",badge:"bg-yellow-100 text-yellow-700"},{value:"incident_alert",label:"🚨 Incident Alert",color:"bg-orange-50 border-orange-200",badge:"bg-orange-100 text-orange-700"},{value:"complaint_update",label:"🎫 Complaint Update",color:"bg-purple-50 border-purple-200",badge:"bg-purple-100 text-purple-700"}];

// ── Fast2SMS config (India — cost-effective SMS & WhatsApp) ─
const FAST2SMS_API_KEY = import.meta.env.VITE_FAST2SMS_API_KEY || "";

// ── Template definitions (used for both SMS and WhatsApp previews) ──
// These build the human-readable message text sent via Fast2SMS
const WA_TEMPLATES = {
  maintenance_due: {
    preview: (name, flat, month, amount) =>
`💰 Maintenance Due — GM Jelani Heights

Dear ${name},

Your maintenance for Flat ${flat} is pending.

📅 Month: ${month}
💵 Amount: ₹${amount}
📆 Pay before: 10th ${month}

Pay via UPI / Cash to Watchman.

GM Jelani Heights Management`
  },
  meeting_reminder: {
    preview: (name, flat, msg) =>
`📋 Meeting Notice — GM Jelani Heights

Dear Residents,

You are invited to ${msg||"General Meeting"}.

📅 Date: ${new Date().toLocaleDateString("en-IN")}
⏰ Time: 7:00 PM
📍 Venue: Common Area

Your presence is important.

GM Jelani Heights Management`
  },
  notice: {
    preview: (name, flat, msg) =>
`📢 Notice — GM Jelani Heights

Dear Residents,

${msg||"Important notice from management."}

📆 Date: ${new Date().toLocaleDateString("en-IN")}

GM Jelani Heights Management`
  },
  incident_alert: {
    preview: (name, flat, msg) =>
`🚨 Incident Alert — GM Jelani Heights

Dear Residents,

${msg||"An incident has been reported. Management is addressing it."}

📆 Date: ${new Date().toLocaleDateString("en-IN")}

Stay vigilant and report anything suspicious.

GM Jelani Heights Management`
  },
  complaint_update: {
    preview: (name, flat, msg) =>
`🎫 Complaint Update — GM Jelani Heights

Dear ${name} (Flat ${flat}),

Your complaint has been updated.

📋 Status: In Progress
💬 Note: ${msg||"We are working on it."}

GM Jelani Heights Management`
  },
};

// ══════════════════════════════════════════════════════════
// 📱 Fast2SMS — SMS (plain text, Indian numbers)
// Route: "q" (Quick/Transactional)
// Cost: ~₹0.20/SMS  |  Key: VITE_FAST2SMS_API_KEY
// ══════════════════════════════════════════════════════════
async function sendSMS(phone, message) {
  let cleanPhone = String(phone).replace(/\D/g, "");
  if (cleanPhone.startsWith("91") && cleanPhone.length === 12) cleanPhone = cleanPhone.slice(2);
  if (cleanPhone.length !== 10) return { success: false, error: "Invalid phone" };
  const smsText = message.replace(/\*/g, "").replace(/_/g, "").slice(0, 320);
  try {
    const res = await fetch("/fast2sms/dev/bulkV2", {
      method: "POST",
      headers: { "authorization": FAST2SMS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ route: "v3", message: smsText, language: "english", flash: 0, numbers: cleanPhone }),
    });
    const data = await res.json();
    console.log("[Fast2SMS SMS] Sent to", cleanPhone, "→", data);
    return { success: data.return === true, phone: cleanPhone, data };
  } catch(e) { console.error("[Fast2SMS SMS] Error:", e); return { success: false, error: e.message }; }
}

// ══════════════════════════════════════════════════════════
// 💬 Fast2SMS — WhatsApp (same API key, different route)
// Route: "wa"  |  Key: same VITE_FAST2SMS_API_KEY
// Note: Fast2SMS WhatsApp requires their WhatsApp service plan
// ══════════════════════════════════════════════════════════
async function sendWhatsApp(phone, templateType, name, flat, extraParam) {
  let cleanPhone = String(phone).replace(/\D/g, "");
  if (cleanPhone.startsWith("91") && cleanPhone.length === 12) cleanPhone = cleanPhone.slice(2);
  if (cleanPhone.length !== 10) return { success: false, error: "Invalid phone" };

  const tmpl = WA_TEMPLATES[templateType] || WA_TEMPLATES.notice;
  const month = MONTHS[new Date().getMonth()]+" "+new Date().getFullYear();
  const msgText = tmpl.preview(name, flat, extraParam||month, extraParam||5000);

  try {
    const res = await fetch("/fast2sms/dev/wa", {
      method: "POST",
      headers: { "authorization": FAST2SMS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        route: "wa",
        message: [{ type: "text", text: { body: msgText } }],
        numbers: cleanPhone,
      }),
    });
    const data = await res.json();
    console.log("[Fast2SMS WA] Sent to", cleanPhone, "→", data);
    return { success: data.return === true, phone: cleanPhone, data };
  } catch(e) { console.error("[Fast2SMS WA] Error:", e); return { success: false, error: e.message }; }
}

// ── WhatsApp Authorization Key (separate from SMS key) ───────
const FAST2SMS_WA_KEY = import.meta.env.VITE_FAST2SMS_WA_KEY || "";

// ── Approved Meta template IDs from Fast2SMS panel ───────────
const WA_TEMPLATE_IDS = {
  maintenance_paid: "1640742647116836",
  maintenance_due:  "2051893029001745",
};

// ── Send WhatsApp using approved Meta template ────────────────
// variables array maps to {{1}} {{2}} {{3}} {{4}} in template
// [name, flatNumber, month, amount]
async function sendWhatsAppDirect(phone, templateType, variables) {
  let cleanPhone = String(phone).replace(/\D/g, "");
  if (cleanPhone.startsWith("91") && cleanPhone.length === 12) cleanPhone = cleanPhone.slice(2);
  if (cleanPhone.length !== 10) return { success: false, error: "Invalid phone" };
  const templateId = WA_TEMPLATE_IDS[templateType];
  if (!templateId) return { success: false, error: "Unknown template: " + templateType };
  try {
    const res = await fetch("/fast2sms/dev/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authorization: FAST2SMS_WA_KEY,
        route:         "wp",
        message_id:    templateId,
        language:      "en",
        numbers:       cleanPhone,
        variables:     variables,
      }),
    });
    const data = await res.json();
    console.log("[Fast2SMS WA Template] Sent to", cleanPhone, "→", data);
    return { success: data.return === true, phone: cleanPhone, data };
  } catch(e) {
    console.error("[Fast2SMS WA Template] Error:", e);
    return { success: false, error: e.message };
  }
}

// ── Preview builder for UI ────────────────────────────────
function buildMessage(type, flatNumber, buildingName, amount, customMessage){
  const flat = flatNumber ? "Flat "+flatNumber : "All Residents";
  const name = "Resident";
  const tmpl = WA_TEMPLATES[type] || WA_TEMPLATES.notice;
  const month = MONTHS[new Date().getMonth()]+" "+new Date().getFullYear();
  return tmpl.preview(name, flat, customMessage||month, amount||5000);
}

// ── Send Status Modal (WhatsApp bulk payment status) ────────
function SendStatusModal({data,db,projectId,onClose}){
  const notifCol = () => projectId ? collection(db,"projects",projectId,"notifications") : collection(db,"notifications");
  const [selYear,setSelYear]=useState(TODAY.getFullYear()<START_YEAR?START_YEAR:TODAY.getFullYear());
  const [selMonth,setSelMonth]=useState(TODAY.getMonth());
  const [sending,setSending]=useState(false);
  const [results,setResults]=useState(null);

  function getCol(flat,y,m){return(data.collections?.[flat]&&data.collections[flat][y+"-"+m])||{amount:5000,paid:false,advance:false};}

  const FLATS_LOCAL = projectId
    ? Object.keys(data.flats||{}).map(Number).filter(Boolean)
    : [101,102,103,104,201,202,203,204,301,302,303,304,401,402,403,404,501,502,503,504,601,602];

  const preview=FLATS_LOCAL.map(flat=>{
    const fd=data.flats[flat];
    if(!fd) return null;
    const c=getCol(flat,selYear,selMonth);
    const name=fd.currentTenant?fd.currentTenant.name:fd.ownerName;
    const phone=fd.currentTenant?fd.currentTenant.phone:fd.ownerPhone;
    const isPaid=c.paid&&!c.advance;
    return{flat,name,phone,isPaid,amount:c.amount};
  }).filter(Boolean);

  function buildStatusMsg(name,flat,month,year,isPaid,amount){
    const monthLabel=MONTHS[month]+" "+year;
    if(isPaid){
      return `✅ Maintenance Received — GM Jelani Heights\n\nDear ${name},\n\nThis is to confirm that your maintenance payment for Flat ${flat} has been received.\n\n📅 Month: ${monthLabel}\n💵 Amount: ₹${amount}\n\nThank you for the timely payment!\n\nGM Jelani Heights Management`;
    } else {
      return `🔔 Maintenance Due — GM Jelani Heights\n\nDear ${name},\n\nThis is a reminder that your maintenance for Flat ${flat} is still due.\n\n📅 Month: ${monthLabel}\n💵 Amount: ₹${amount}\n📆 Please pay before 10th ${monthLabel}.\n\nPay via UPI / Cash to Watchman.\n\nGM Jelani Heights Management`;
    }
  }

  async function sendAll(){
    if(!FAST2SMS_WA_KEY) return alert("❌ WhatsApp API key not set!\n\nAdd VITE_FAST2SMS_WA_KEY to your .env.local file.\nThis is your WhatsApp Authorization Key from Fast2SMS panel — different from the SMS key.");
    setSending(true);
    const res=[];
    const monthLabel=MONTHS[selMonth]+" "+selYear;
    for(const p of preview){
      if(!p.phone||p.phone==="9999999999"){res.push({...p,status:"skipped",reason:"No phone"});continue;}
      // Use approved Meta templates — variables map to {{1}} {{2}} {{3}} {{4}}
      const templateType = p.isPaid ? "maintenance_paid" : "maintenance_due";
      const variables = [
        p.name,               // {{1}} = resident name
        String(p.flat),       // {{2}} = flat number
        monthLabel,           // {{3}} = month + year
        String(p.amount),     // {{4}} = amount
      ];
      const r=await sendWhatsAppDirect(p.phone, templateType, variables);
      res.push({...p,status:r.success?"sent":"failed",reason:r.error||""});
    }
    const notif={title:`Payment Status — ${MONTHS[selMonth]} ${selYear}`,type:"maintenance_due",channel:"whatsapp",createdAt:new Date().toISOString(),sentTo:res.map(r=>({flat:r.flat,name:r.name,phone:r.phone,delivered:r.status==="sent"})),targetAll:true};
    try{await addDoc(notifCol(),notif);}catch(e){}
    setResults(res);
    setSending(false);
  }

  const paidCount=preview.filter(p=>p.isPaid).length;
  const pendingCount=preview.length-paidCount;

  return(
    <div className="fixed inset-0 bg-black bg-opacity-70 z-[100] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-gray-800">💬 Send Payment Status via WhatsApp</h2>
            <p className="text-xs text-gray-500 mt-0.5">Sends personalised status to all flats for selected month</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold leading-none">×</button>
        </div>
        <div className="p-5 space-y-5">
          {/* Year/Month picker */}
          <div className="flex gap-3 items-center">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 mb-1">Select Year</label>
              <select value={selYear} onChange={e=>setSelYear(parseInt(e.target.value))} className="w-full px-3 py-2 border rounded-lg text-sm font-semibold">
                {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 mb-1">Select Month</label>
              <select value={selMonth} onChange={e=>setSelMonth(parseInt(e.target.value))} className="w-full px-3 py-2 border rounded-lg text-sm font-semibold">
                {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
            </div>
          </div>
          {/* Summary chips */}
          <div className="flex gap-3">
            <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{paidCount}</p>
              <p className="text-xs font-semibold text-emerald-600">✅ Will receive Paid message</p>
            </div>
            <div className="flex-1 bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
              <p className="text-xs font-semibold text-orange-500">🔔 Will receive Due reminder</p>
            </div>
          </div>
          {/* Preview table */}
          {!results&&(
            <div className="border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500">PREVIEW — {MONTHS[selMonth]} {selYear}</div>
              <div className="divide-y max-h-60 overflow-y-auto">
                {preview.map(p=>(
                  <div key={p.flat} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <span className="font-bold text-blue-600 text-sm mr-2">Flat {p.flat}</span>
                      <span className="text-sm text-gray-700">{p.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{p.phone}</span>
                    </div>
                    <span className={"text-xs font-bold px-2 py-0.5 rounded-full "+(p.isPaid?"bg-emerald-100 text-emerald-700":"bg-orange-100 text-orange-600")}>{p.isPaid?"✅ Paid":"🔔 Due"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Results after sending */}
          {results&&(
            <div className="border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500">SEND RESULTS</div>
              <div className="divide-y max-h-60 overflow-y-auto">
                {results.map(r=>(
                  <div key={r.flat} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <span className="font-bold text-blue-600 text-sm mr-2">Flat {r.flat}</span>
                      <span className="text-sm text-gray-700">{r.name}</span>
                    </div>
                    <span className={"text-xs font-bold px-2 py-0.5 rounded-full "+(r.status==="sent"?"bg-green-100 text-green-700":r.status==="skipped"?"bg-gray-100 text-gray-500":"bg-red-100 text-red-600")}>{r.status==="sent"?"✓ Sent":r.status==="skipped"?"— Skipped":"✗ Failed"}</span>
                  </div>
                ))}
              </div>
              <div className="bg-gray-50 px-4 py-2 text-xs text-gray-600 font-semibold">
                ✅ {results.filter(r=>r.status==="sent").length} sent · ✗ {results.filter(r=>r.status==="failed").length} failed · — {results.filter(r=>r.status==="skipped").length} skipped
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            {!results&&<button onClick={sendAll} disabled={sending} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl font-bold text-sm">
              <Send size={15}/>{sending?"Sending to all flats...":"📲 Send Status to All Flats"}
            </button>}
            <button onClick={onClose} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-300">{results?"Close":"Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationsPage({db, projectId, setView, navView, isAdmin, role, data, flats=[]}){
  const notifCol = () => projectId ? collection(db,"projects",projectId,"notifications") : collection(db,"notifications");
  const [notifications,setNotifications]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showCompose,setShowCompose]=useState(false);
  const [showSendStatus,setShowSendStatus]=useState(false);
  const [sending,setSending]=useState(false);
  const [form,setForm]=useState({type:"notice",title:"",message:"",targetFlat:"",targetAll:true,amount:"",channel:"whatsapp"});
  const [preview,setPreview]=useState("");

  useEffect(()=>{
    async function load(){
      try{
        const snap=await getDocs(notifCol());
        setNotifications(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)));
      }catch(e){console.error(e);}
      setLoading(false);
    }
    load();
  },[projectId]);

  useEffect(()=>{
    const msg=buildMessage(form.type,form.targetAll?"":form.targetFlat,data?.building?.name||"GM Jelani Heights",form.amount,form.message);
    setPreview(msg);
  },[form]);

  async function sendNotification(){
    if(!form.title.trim()) return alert("Please add a title.");
    if(!FAST2SMS_API_KEY) return alert("❌ Fast2SMS API key not set!\n\nAdd VITE_FAST2SMS_API_KEY to your .env.local file.\nGet your key at https://www.fast2sms.com");
    setSending(true);
    const targetFlats=form.targetAll?FLATS:[parseInt(form.targetFlat)].filter(Boolean);
    const sentTo=[];let successCount=0,failCount=0;
    for(const flat of targetFlats){
      const fd=data?.flats?.[flat];
      if(fd){
        const phone=fd.currentTenant?fd.currentTenant.phone:fd.ownerPhone;
        const name=fd.currentTenant?fd.currentTenant.name:fd.ownerName;
        let result;
        if(form.channel==="whatsapp"){
          const extraParam=form.type==="maintenance_due"?(form.amount||5000):form.message;
          result=await sendWhatsApp(phone,form.type,name,String(flat),extraParam);
        } else {
          const smsMessage=buildMessage(form.type,String(flat),data?.building?.name||"GM Jelani Heights",form.type==="maintenance_due"?(form.amount||5000):undefined,form.message);
          result=await sendSMS(phone,smsMessage);
        }
        sentTo.push({flat,name,phone,delivered:result.success});
        if(result.success) successCount++; else failCount++;
      }
    }
    const notif={title:form.title,message:preview,type:form.type,channel:form.channel,createdAt:new Date().toISOString(),sentTo,targetAll:form.targetAll};
    try{
      const ref=await addDoc(notifCol(),notif);
      setNotifications(ns=>[{id:ref.id,...notif},...ns]);
      setShowCompose(false);setForm({type:"notice",title:"",message:"",targetFlat:"",targetAll:true,amount:"",channel:"whatsapp"});
      alert(`✅ ${form.channel==="whatsapp"?"WhatsApp":"SMS"} sent!\n\nDelivered: ${successCount} | Failed: ${failCount}`);
    }catch(e){alert("Error saving notification log: "+e.message);}
    setSending(false);
  }

  const typeInfo=t=>NOTIF_TYPES.find(n=>n.value===t)||NOTIF_TYPES[2];

  if(loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return(
    <div className="min-h-screen bg-gray-50">
      {showSendStatus&&<SendStatusModal data={data} db={db} projectId={projectId} onClose={()=>setShowSendStatus(false)}/>}
      <header className="bg-gradient-to-r from-green-600 to-emerald-700 text-white p-6">
        <h1 className="text-3xl font-bold">📲 Notifications</h1>
        <p className="text-green-100 text-sm mt-1">{notifications.length} sent · SMS &amp; WhatsApp via Fast2SMS</p>
      </header>
      <NavBar view={navView} setView={setView} role={role}/>
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-5">
        {isAdmin&&(
          <div className="flex gap-3 flex-wrap">
            {/* PRIMARY: Send Status button */}
            <button onClick={()=>setShowSendStatus(true)} className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 shadow-md hover:shadow-lg transition-all">
              <span className="text-base">💬</span> Send Status
              <span className="text-xs bg-white bg-opacity-20 px-2 py-0.5 rounded-full font-normal">WhatsApp · All Flats</span>
            </button>
            <button onClick={()=>setShowCompose(!showCompose)} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition">
              <Send size={14}/> Custom Notification
            </button>
          </div>
        )}

        {showCompose&&isAdmin&&(
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-gray-800 text-base">✉️ Custom Notification</h3>
              <button onClick={()=>setShowCompose(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-500 mb-2">Send Via</label>
              <div className="flex gap-3">
                <button onClick={()=>setForm({...form,channel:"whatsapp"})} className={"flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border-2 transition "+(form.channel==="whatsapp"?"border-green-500 bg-green-50 text-green-700":"border-gray-200 text-gray-500 hover:bg-gray-50")}>💬 WhatsApp</button>
                <button onClick={()=>setForm({...form,channel:"sms"})} className={"flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border-2 transition "+(form.channel==="sms"?"border-blue-500 bg-blue-50 text-blue-700":"border-gray-200 text-gray-500 hover:bg-gray-50")}>📱 SMS <span className="text-xs font-normal opacity-70">~₹0.20/msg</span></button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Type</label>
                <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{NOTIF_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select>
              </div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Title *</label><input type="text" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Notification title" className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">Send To</label>
                <div className="flex gap-2">
                  <button onClick={()=>setForm({...form,targetAll:true})} className={"px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition "+(form.targetAll?"border-green-500 bg-green-50 text-green-700":"border-gray-200 text-gray-600")}>All Flats</button>
                  <button onClick={()=>setForm({...form,targetAll:false})} className={"px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition "+(!form.targetAll?"border-blue-500 bg-blue-50 text-blue-700":"border-gray-200 text-gray-600")}>Specific Flat</button>
                </div>
                {!form.targetAll&&<select value={form.targetFlat} onChange={e=>setForm({...form,targetFlat:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm mt-2"><option value="">— Select flat —</option>{flats.map(f=><option key={f} value={f}>Flat {f}</option>)}</select>}
              </div>
              {form.type==="maintenance_due"&&<div><label className="block text-xs font-bold text-gray-500 mb-1">Amount (₹)</label><input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="5000" className="w-full px-3 py-2 border rounded-lg text-sm"/></div>}
              <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Custom Message</label><textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} rows={2} placeholder="Additional message (optional)..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            </div>
            {preview&&(<div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4"><p className="text-xs font-bold text-gray-400 mb-2">MESSAGE PREVIEW</p><pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{preview}</pre></div>)}
            <div className="flex gap-3 mt-4">
              <button onClick={sendNotification} disabled={sending} className={"flex-1 py-2.5 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 "+(form.channel==="whatsapp"?"bg-green-600 hover:bg-green-700":"bg-blue-600 hover:bg-blue-700")}><Send size={14}/>{sending?"Sending...":"Send Now"}</button>
              <button onClick={()=>setShowCompose(false)} className="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm">Cancel</button>
            </div>
          </div>
        )}

        {notifications.length===0&&!showCompose&&<div className="text-center py-16 text-gray-400"><Bell size={48} className="mx-auto mb-4 opacity-30"/><p className="text-lg">No notifications sent yet</p></div>}
        <div className="space-y-3">
          {notifications.map(n=>{const ti=typeInfo(n.type);const sentCount=(n.sentTo||[]).length;const deliveredCount=(n.sentTo||[]).filter(s=>s.delivered).length;return(
            <div key={n.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={"text-xs px-2 py-0.5 rounded-full font-semibold "+ti.badge}>{ti.label}</span>
                    <span className={"text-xs px-2 py-0.5 rounded-full font-semibold "+(n.channel==="whatsapp"?"bg-green-100 text-green-700":"bg-blue-100 text-blue-700")}>{n.channel==="whatsapp"?"💬 WhatsApp":"📱 SMS"}</span>
                    <span className="text-xs text-gray-400">{fmtIndian(n.createdAt?.split("T")[0])}</span>
                  </div>
                  <h3 className="font-bold text-gray-800 text-sm">{n.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{n.targetAll?"All flats":"Targeted"} · {deliveredCount}/{sentCount} delivered</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs font-bold text-emerald-600">✓ {deliveredCount}</div>
                  {sentCount-deliveredCount>0&&<div className="text-xs font-bold text-red-400">✗ {sentCount-deliveredCount}</div>}
                </div>
              </div>
              {n.message&&<div className="mt-3 bg-gray-50 rounded-lg p-3"><pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans line-clamp-3">{n.message}</pre></div>}
            </div>
          );})}
        </div>
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// RESIDENT DASHBOARD
// ══════════════════════════════════════════════════════════
function ResidentDashboard({data, setView, navView, role, flatNumber, projectId, dataLoaded}){
  const flatNum = parseInt(flatNumber);
  // Firestore stores flat keys as numbers — try both number and string key
  const flatData = data?.flats?.[flatNum] || data?.flats?.[String(flatNum)];
  const [complaints,   setComplaints]   = useState([]);
  const [loadingCompl, setLoadingCompl] = useState(true);

  // Load complaints from Firestore for this flat (project-scoped)
  useEffect(()=>{
    if(!flatNum || !projectId) { setLoadingCompl(false); return; }
    async function loadComplaints(){
      try{
        const path = collection(db, "projects", projectId, "complaints");
        const snap = await getDocs(path);
        const all  = snap.docs.map(d=>({id:d.id,...d.data()}));
        setComplaints(all.filter(c=>String(c.flatNumber)===String(flatNumber)));
      }catch(e){ console.error(e); }
      setLoadingCompl(false);
    }
    loadComplaints();
  },[flatNumber, projectId]);

  // Still loading — show spinner not "flat not found"
  if(!dataLoaded){
    return(
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
          <p className="text-gray-500 font-semibold">Loading your flat details...</p>
        </div>
      </div>
    );
  }

  if(!flatNum||!flatData){
    return(
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-10">
          <p className="text-5xl mb-4">🏠</p>
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Flat Not Found</h2>
          <p className="text-gray-500 mb-2">Flat <strong>{flatNumber}</strong> is not in the project data yet.</p>
          <p className="text-xs text-gray-400">Ask your Project Admin to verify your flat number is correctly set up.</p>
        </div>
      </div>
    );
  }

  const getCol=(y,m)=>(data.collections?.[flatNum]&&data.collections[flatNum][y+"-"+m])||{amount:5000,paid:false,advance:false};
  const paidMonths=[],pendingMonths=[],advanceMonths=[];
  YEARS.forEach(y=>MONTHS.forEach((_,m)=>{
    const c=getCol(y,m);
    if(isPast(y,m)||isCurrent(y,m)){
      if(c.paid&&!c.advance) paidMonths.push({y,m,amount:c.amount});
      else if(c.advance) advanceMonths.push({y,m,amount:c.amount});
      else if(!c.paid&&(isPast(y,m)||isCurrent(y,m))) pendingMonths.push({y,m,amount:c.amount});
    }
  }));
  const pendingAmount=pendingMonths.reduce((s,p)=>s+p.amount,0);
  const advanceAmount=advanceMonths.reduce((s,a)=>s+a.amount,0);
  const recentMeetings=(data.meetings||[]).slice(-5).reverse();
  const specialSummary=(data.specialCollections||[]).map(sc=>{const e=sc.entries?.find(x=>x.flatNum===flatNum);return{title:sc.title,paid:e?.paid,amount:e?.amount||0};});

  const name=flatData.currentTenant?flatData.currentTenant.name:flatData.ownerName;
  const phone=flatData.currentTenant?flatData.currentTenant.phone:flatData.ownerPhone;
  const isOwner=!flatData.currentTenant;

  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-3xl">🏠</div>
          <div>
            <h1 className="text-2xl font-bold">{name}</h1>
            <p className="text-blue-100 text-sm">Flat {flatNum} · {isOwner?"Owner":"Tenant"}</p>
            {phone&&phone!=="9999999999"&&<p className="text-blue-200 text-xs mt-0.5">📞 {phone}</p>}
          </div>
        </div>
      </header>
      <NavBar view={navView} setView={setView} role={role}/>
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Payment Status */}
        <div>
          <h2 className="text-lg font-bold text-gray-700 mb-3">💰 Maintenance Status</h2>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="✅ Paid" value={paidMonths.length+" months"} bg="bg-green-50" borderColor="border-green-500"/>
            <MetricCard label="⏳ Pending" value={"₹"+pendingAmount.toLocaleString()} sub={pendingMonths.length+" month(s)"} bg="bg-red-50" borderColor="border-red-500"/>
            <MetricCard label="⬆️ Advance" value={"₹"+advanceAmount.toLocaleString()} sub={advanceMonths.length+" month(s)"} bg="bg-purple-50" borderColor="border-purple-400"/>
          </div>
          {pendingMonths.length>0&&(
            <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-sm font-bold text-orange-700 mb-2">⚠️ Pending Months</p>
              <div className="flex flex-wrap gap-2">
                {pendingMonths.slice(0,12).map(p=>(
                  <span key={p.y+"-"+p.m} className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                    {MONTHS[p.m]} {p.y} · ₹{p.amount.toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Special Collections */}
        {specialSummary.length>0&&(
          <div>
            <h2 className="text-lg font-bold text-gray-700 mb-3">🎯 Special Collections</h2>
            <div className="space-y-2">
              {specialSummary.map((sc,i)=>(
                <div key={i} className={"bg-white rounded-lg shadow p-4 flex justify-between items-center border-l-4 "+(sc.paid?"border-green-400":"border-orange-400")}>
                  <div><p className="font-semibold text-gray-800">{sc.title}</p><p className="text-xs text-gray-400">Amount: ₹{sc.amount.toLocaleString()}</p></div>
                  <span className={"px-3 py-1 rounded-full text-xs font-bold "+(sc.paid?"bg-green-100 text-green-700":"bg-orange-100 text-orange-600")}>{sc.paid?"✓ Paid":"Pending"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My Complaints */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-gray-700">🎫 My Complaints</h2>
            <button onClick={()=>setView("complaints")} className="text-xs text-blue-600 font-semibold hover:underline">View All & File New →</button>
          </div>
          {loadingCompl
            ?<div className="bg-white rounded-lg shadow p-6 text-center text-gray-400"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto"/></div>
            :complaints.length===0
              ?<div className="bg-white rounded-lg shadow p-6 text-center text-gray-400"><AlertCircle size={32} className="mx-auto mb-2 opacity-40"/><p>No complaints filed yet</p></div>
              :<div className="space-y-2">{complaints.slice(0,3).map(c=>(
                <div key={c.id} className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
                  <div><p className="font-semibold text-gray-800">{c.title}</p><p className="text-xs text-gray-400">{c.category} · {fmtIndian(c.createdAt?.split("T")[0])}</p></div>
                  <span className={"px-3 py-1 rounded-full text-xs font-bold border "+(STATUS_COLORS[c.status]||"bg-gray-100")}>{c.status}</span>
                </div>
              ))}</div>
          }
        </div>

        {/* Recent Meetings & Notices */}
        <div>
          <h2 className="text-lg font-bold text-gray-700 mb-3">📋 Notices & Meetings</h2>
          {recentMeetings.length===0
            ?<div className="bg-white rounded-lg shadow p-6 text-center text-gray-400"><p>No recent notices</p></div>
            :<div className="space-y-2">{recentMeetings.map((m,i)=>(
              <div key={m.id||i} className="bg-white rounded-lg shadow p-4">
                <p className="font-semibold text-gray-800">{m.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{fmtIndian(m.date)} · {m.venue||"TBD"}</p>
                {m.description&&<p className="text-sm text-gray-600 mt-1 line-clamp-2">{m.description}</p>}
              </div>
            ))}</div>
          }
        </div>
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN EXPORT — AppContent receives isAdmin from Dashboard.jsx
// ══════════════════════════════════════════════════════════
export default function AppContent({ isAdmin, role = "admin", flatNumber = null, currentUser = null, projectId = null, projectFlats = null }) {

  // Build the correct Firestore ref for this project
  function getDataRef() {
    return projectId
      ? doc(db, "projects", projectId, "data", "main")
      : doc(db, "apartmentData", "main");
  }

  const [data,       setData]       = useState(() => initData(projectFlats || []));
  const [dataLoaded, setDataLoaded] = useState(false);

  // ── FLATS — always derived from loaded data, never hardcoded ─
  // Priority: projectFlats prop → keys in data.flats → hardcoded fallback
  const FLATS = useMemo(() => {
    if (projectFlats && projectFlats.length > 0) return projectFlats;
    if (data?.flats && Object.keys(data.flats).length > 0) {
      return Object.keys(data.flats).map(Number).filter(Boolean).sort((a,b)=>a-b);
    }
    // Last resort fallback — only used before data loads
    return [101,102,103,104,201,202,203,204,301,302,303,304,401,402,403,404,501,502,503,504,601,602];
  }, [projectFlats, data?.flats]);

  // Load data whenever projectId changes — reset state first to avoid showing stale data
  useEffect(() => {
    setDataLoaded(false);
    setData(initData(FLATS));   // clear to empty so old project data doesn't flash

    async function loadData() {
      try {
        const snap = await getDoc(getDataRef());
        if (snap.exists()) {
          setData(snap.data());
        } else {
          // Brand new project — keep the empty initData we already set
          setData(initData(FLATS));
        }
      } catch (e) {
        console.error("Error loading data:", e);
      }
      setDataLoaded(true);
    }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Save — only admins can write. Residents are read-only.
  useEffect(() => {
    if (!dataLoaded) return;
    if (!isAdmin) return;   // ← residents never write to Firestore
    async function saveData() {
      try {
        await setDoc(getDataRef(), data);
      } catch (e) {
        console.error("Error saving data:", e);
      }
    }
    saveData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dataLoaded]);
  const [currentMonth,setCurrentMonth]    = useState(TODAY.getMonth());
  const [currentYear,setCurrentYear]      = useState(TODAY.getFullYear()<START_YEAR?START_YEAR:TODAY.getFullYear());
  const [view,setView]                    = useState("dashboard");
  // Redirect resident to their dashboard once role is known (AuthContext is async)
  useEffect(()=>{
    if(role==="resident") setView("resident");
  },[role]);
  const [selectedFlat,setSelectedFlat]    = useState(null);
  const [showAddExpense,setShowAddExpense] = useState(false);
  const [editingExpense,setEditingExpense] = useState(null);
  const [showBulkAdd,setShowBulkAdd]      = useState(false);
  const [bulkAmount,setBulkAmount]        = useState("");
  const [excludedFlats,setExcludedFlats]  = useState([]);
  const [selectedExpEntry,setSelectedExpEntry] = useState(null);
  const [newExpense,setNewExpense]         = useState({category:"Salary",subcategory:"Watchman Salary",amount:"",units:"",unitType:"monthly"});
  const [addingTenant,setAddingTenant]    = useState(false);
  const [draftTenant,setDraftTenant]      = useState(emptyTenant());
  const [showCatMgr,setShowCatMgr]        = useState(false);
  const [showCsvModal,setShowCsvModal]    = useState(false);
  const [showRecordPmt,setShowRecordPmt]  = useState(false);
  const [paymentFlat,setPaymentFlat]      = useState(null);
  const [expFilter,setExpFilter]          = useState("all");
  const [colView,setColView]              = useState("year");
  const [showAudit,setShowAudit] = useState(false);
  const [auditFilter,setAuditFilter] = useState("1y");
  const [confirmPmt,setConfirmPmt] = useState(null);
  // const [data, setData] = useState(initData);


  // Default maintenance amount — configurable per project, falls back to 5000
  const defaultAmt = parseFloat(data?.building?.defaultMaintenanceAmount || 5000);
  function gc(flat,y,m){return(data.collections[flat]&&data.collections[flat][y+"-"+m])||{amount:defaultAmt,paid:false,advance:false};}

  // ── Escalation system ─────────────────────────────────────
  const { escalationMap, config: escConfig, running: escRunning, lastRun: escLastRun, runEscalation } = useEscalation({
    data, projectId, FLATS, isAdmin
  })

  // Wrap sendWhatsAppDirect for escalation hook
  async function escalationSendWA(phone, templateType, variables) {
    return sendWhatsAppDirect(phone, templateType, variables)
  }
  // ── Role helpers ──────────────────────────────────────────
  const canViewPersonal = role==="admin";
  const isOwnFlat = role==="resident" && parseInt(flatNumber)===selectedFlat;
  function isYearFrozen(year){return(data.auditedPeriods||[]).some(a=>a.year===year&&a.status==="approved");}
  const frozenYears=useMemo(()=>new Set((data.auditedPeriods||[]).filter(a=>a.status==="approved").map(a=>a.year)),[data.auditedPeriods]);
  function updateFlat(flat,upd){setData(p=>({...p,flats:{...p.flats,[flat]:{...p.flats[flat],...upd}}}));}
  function togglePayment(flat,y,m){if(!isAdmin||isYearFrozen(y)) return;setData(p=>{const key=y+"-"+m,col=p.collections[flat],cur=col[key]||{amount:defaultAmt,paid:false,advance:false};return{...p,collections:{...p.collections,[flat]:{...col,[key]:{...cur,paid:!cur.paid,advance:!cur.paid&&isFuture(y,m)}}}};});}
  function requestToggle(flat,y,m){if(!isAdmin||isYearFrozen(y)) return;setConfirmPmt({flat,year:y,month:m});}
  function confirmToggle(){if(!confirmPmt) return;togglePayment(confirmPmt.flat,confirmPmt.year,confirmPmt.month);setConfirmPmt(null);}
  const confirmPmtInfo=confirmPmt?{cur:gc(confirmPmt.flat,confirmPmt.year,confirmPmt.month),flatId:confirmPmt.flat,monthLabel:MONTHS[confirmPmt.month]+" "+confirmPmt.year}:null;
  function updateAmt(flat,y,m,amt){if(!isAdmin||isYearFrozen(y)) return;setData(p=>{const key=y+"-"+m,col=p.collections[flat];return{...p,collections:{...p.collections,[flat]:{...col,[key]:{...col[key]||{amount:defaultAmt,paid:false,advance:false},amount:parseFloat(amt)||0}}}};});}
  function getFlatStatus(flat){
    if(!data.flats?.[flat]) return "vacant";
    if(data.flats[flat].ownerOccupied) return "owner";
    if(data.flats[flat].currentTenant) return "tenant";
    return "vacant";
  }
  function getFlatPending(flat){
    let overdue=0,current=0,credit=0;
    YEARS.forEach(y=>MONTHS.forEach((_,m)=>{
      const c=gc(flat,y,m);
      if(c.paid&&c.advance){credit+=c.amount;return;}
      if(!c.paid){
        if(isPast(y,m)) overdue+=c.amount;
        else if(isCurrent(y,m)) current+=c.amount;
      }
    }));
    return{overdue,current,credit};
  }

  function getSpecialTotal(y,m){
    return (data.specialCollections||[]).reduce((sum,sc)=>{
      return sum+sc.entries.filter(e=>{
        if(!e.paid||!e.paidDate) return false;
        const d=new Date(e.paidDate);
        return d.getFullYear()===y&&d.getMonth()===m;
      }).reduce((s,e)=>s+parseFloat(e.amount||0),0);
    },0);
  }

  const pendingMetrics=useMemo(()=>{
    let to=0,tc=0;
    FLATS.forEach(f=>{YEARS.forEach(y=>MONTHS.forEach((_,m)=>{const c=gc(f,y,m);if(c.paid) return;if(isPast(y,m)) to+=c.amount;else if(isCurrent(y,m)) tc+=c.amount;}));});
    return{totalOverdue:to,totalCurrent:tc};
  },[data,currentYear,currentMonth]);

const carryForward = useMemo(() => {
  let bal = parseFloat(data?.building?.openingBalance || 0);

  YEARS.forEach(y => MONTHS.forEach((_, m) => {
    if (y > currentYear || (y === currentYear && m >= currentMonth)) return;

    const maint = FLATS.reduce((s, f) => {
      const c = gc(f, y, m);
      return s + (c.paid && !c.advance ? c.amount : 0);
    }, 0);

    const special = getSpecialTotal(y, m);

    const exp = data.expenses
      .filter(e => e.year === y && e.month === m)
      .reduce((s, e) => s + e.amount, 0);

    bal += (maint + special - exp);
  }));

  return bal;

}, [data, currentMonth, currentYear]);

  function openRecordPmt(flat){if(!isAdmin) return;setPaymentFlat(flat);setShowRecordPmt(true);}
  function submitPayment(form){
    if(!form.amount||form.selectedMonths.length===0){alert("Enter amount and select months.");return;}
    setData(p=>{const col={...p.collections[paymentFlat]};form.selectedMonths.forEach(m=>{const cur=col[m.key]||{amount:5000,paid:false,advance:false};col[m.key]={...cur,paid:true,advance:isFuture(m.year,m.month),receivedDate:form.date,receivedMode:form.method,receivedFrom:form.receivedFrom};});const entry={id:Date.now().toString(),date:form.date,amount:parseFloat(form.amount),method:form.method,receivedFrom:form.receivedFrom,comments:form.comments,months:form.selectedMonths};return{...p,collections:{...p.collections,[paymentFlat]:col},paymentLedger:{...p.paymentLedger,[paymentFlat]:[...(p.paymentLedger[paymentFlat]||[]),entry]}};});
    setShowRecordPmt(false);setPaymentFlat(null);
  }
  function markOwnerOccupied(flat){if(!isAdmin) return;const t=data.flats[flat].currentTenant;const history=t?[...data.flats[flat].tenantHistory,{...t,moveOutDate:new Date().toISOString().split("T")[0]}]:data.flats[flat].tenantHistory;updateFlat(flat,{ownerOccupied:true,currentTenant:null,tenantHistory:history});}
  function markForRent(flat){if(!isAdmin) return;updateFlat(flat,{ownerOccupied:false,currentTenant:null});}
  function vacateFlat(flat){if(!isAdmin) return;const t=data.flats[flat].currentTenant;if(!t) return;updateFlat(flat,{currentTenant:null,tenantHistory:[...data.flats[flat].tenantHistory,{...t,moveOutDate:new Date().toISOString().split("T")[0]}]});}
  // NEW FUNCTION - Add after vacateFlat function (after line 715)
function markOwnerSold(flat){
  if(!isAdmin) return;
  const currentOwner = data.flats[flat];
  if(currentOwner.ownerOccupied === false && currentOwner.currentTenant === null) {
    alert("Flat is vacant. Please mark owner first before selling.");
    return;
  }
  
  // Save current owner to previousOwners list
  const ownerRecord = {
    name: currentOwner.ownerName,
    phone: currentOwner.ownerPhone,
    email: currentOwner.ownerEmail,
    altName: currentOwner.ownerAltName,
    altPhone: currentOwner.ownerAltPhone,
    altRelation: currentOwner.ownerAltRelation,
    stayingSince: currentOwner.ownerStayingSince,
    saleDate: new Date().toISOString().split("T")[0]
  };
  
  // Reset flat to empty state with new owner history
  updateFlat(flat, {
    previousOwners: [...(data.flats[flat].previousOwners || []), ownerRecord],
    ownerName: "Owner " + flat,
    ownerPhone: "9999999999",
    ownerEmail: "",
    ownerAltName: "",
    ownerAltPhone: "",
    ownerAltRelation: "",
    ownerStayingSince: "",
    ownerAdults: 1,
    ownerKids: 0,
    ownerOccupied: false,
    currentTenant: null,
    tenantHistory: []
  });
}
  function saveTenant(flat){if(!isAdmin) return;if(!draftTenant.name.trim()){alert("Enter tenant name");return;}updateFlat(flat,{currentTenant:{...draftTenant},ownerOccupied:false});setAddingTenant(false);}
  function updTenant(flat,f,v){if(!isAdmin) return;updateFlat(flat,{currentTenant:{...data.flats[flat].currentTenant,[f]:v}});}
  function deleteExpense(id){if(!isAdmin) return;const _de=data.expenses.find(e=>e.id===id);if(_de&&isYearFrozen(_de.year)) return;setData(p=>({...p,expenses:p.expenses.filter(e=>e.id!==id)}));}
  function addExpense(){
    if(!isAdmin||!newExpense.amount||!newExpense.category||!newExpense.subcategory||isYearFrozen(currentYear)) return;
    if(editingExpense){setData(p=>({...p,expenses:p.expenses.map(e=>e.id===editingExpense.id?{...e,...newExpense,year:currentYear,month:currentMonth,amount:parseFloat(newExpense.amount),units:parseFloat(newExpense.units)||0}:e)}));setEditingExpense(null);}
    else{setData(p=>({...p,expenses:[...p.expenses,{id:Date.now().toString(),year:currentYear,month:currentMonth,...newExpense,amount:parseFloat(newExpense.amount),units:parseFloat(newExpense.units)||0}]}));}
    setNewExpense({category:"Salary",subcategory:"Watchman Salary",amount:"",units:"",unitType:"monthly"});setShowAddExpense(false);
  }
  function bulkAdd(){if(!isAdmin||!bulkAmount) return;const amt=parseFloat(bulkAmount),key=currentYear+"-"+currentMonth;setData(p=>{const upd={};FLATS.filter(f=>!excludedFlats.includes(f)).forEach(f=>{upd[f]={...p.collections[f],[key]:{amount:amt,paid:true,advance:false}};});return{...p,collections:{...p.collections,...upd}};});setBulkAmount("");setExcludedFlats([]);setShowBulkAdd(false);}
  function downloadData(){const uri="data:application/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(data,null,2));const a=document.createElement("a");a.href=uri;a.download="apt-data-"+Date.now()+".json";document.body.appendChild(a);a.click();document.body.removeChild(a);}
  function onAddCat(n){if(!isAdmin) return;n=n.trim();if(!n||data.expenseCategories[n]) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[n]:[]}}));}
  function onDeleteCat(c){if(!isAdmin) return;if(!window.confirm("Delete "+c+"?")) return;setData(p=>{const e={...p.expenseCategories};delete e[c];return{...p,expenseCategories:e};});}
  function onRenameCat(o,n){if(!isAdmin) return;n=n.trim();if(!n||n===o) return;setData(p=>{const c={};Object.keys(p.expenseCategories).forEach(k=>{c[k===o?n:k]=p.expenseCategories[k];});return{...p,expenseCategories:c,expenses:p.expenses.map(e=>e.category===o?{...e,category:n}:e)};});}
  function onAddSub(c,n){if(!isAdmin) return;n=n.trim();if(!n||data.expenseCategories[c].includes(n)) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[c]:[...p.expenseCategories[c],n]}}));}
  function onDeleteSub(c,s){if(!isAdmin) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[c]:p.expenseCategories[c].filter(x=>x!==s)}}));}
  function onRenameSub(c,o,n){if(!isAdmin) return;n=n.trim();if(!n||n===o) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[c]:p.expenseCategories[c].map(s=>s===o?n:s)},expenses:p.expenses.map(e=>(e.category===c&&e.subcategory===o)?{...e,subcategory:n}:e)}));}
  function onImport(preview){if(!isAdmin) return;setData(p=>{const nf={...p.flats};preview.forEach(({flatNum,occ,row})=>{const ex={...nf[flatNum]};ex.ownerName=row["owner_name"]||ex.ownerName;ex.ownerPhone=row["owner_phone"]||ex.ownerPhone;ex.ownerEmail=row["owner_email"]||ex.ownerEmail;if(occ==="owner"){ex.ownerOccupied=true;ex.currentTenant=null;}if(occ==="vacant"){ex.ownerOccupied=false;ex.currentTenant=null;}if(occ==="tenant"){ex.ownerOccupied=false;ex.currentTenant={name:row["tenant_name"]||"",phone:row["tenant_phone"]||"",email:row["tenant_email"]||"",moveInDate:parseDate(row["tenant_move_in_date"])||"",permanentAddress:row["tenant_permanent_address"]||"",adults:parseInt(row["tenant_adults"])||1,children:parseInt(row["tenant_children"])||0,idType:row["tenant_id_type"]||"",idNumber:row["tenant_id_number"]||"",emergencyContact:row["tenant_emergency_contact"]||"",emergencyRelation:row["tenant_emergency_relation"]||""};}nf[flatNum]=ex;});return{...p,flats:nf};});setShowCsvModal(false);alert("✅ Imported "+preview.length+" flats.");}
  function updateCommittee(members){setData(p=>({...p,managingCommittee:members}));}

  const stats=useMemo(()=>{
    const owners=FLATS.filter(f=>data.flats?.[f]?.ownerOccupied).length;
    const tenants=FLATS.filter(f=>data.flats?.[f]&&!data.flats[f].ownerOccupied&&data.flats[f].currentTenant).length;
    return{owners,tenants,vacant:FLATS.length-owners-tenants};
  },[data,FLATS]);
  const metrics=useMemo(()=>{const maint=FLATS.reduce((s,n)=>{const c=gc(n,currentYear,currentMonth);return s+(c.paid&&!c.advance?c.amount:0);},0);const special=getSpecialTotal(currentYear,currentMonth);const collected=maint+special;const expenses=data.expenses.filter(e=>e.year===currentYear&&e.month===currentMonth).reduce((s,e)=>s+e.amount,0);return{maint,special,collected,expenses,balance:collected-expenses};},[data,currentMonth,currentYear]);

  function trendData(){const maxMonth=currentYear<TODAY.getFullYear()?11:currentYear===TODAY.getFullYear()?TODAY.getMonth():-1;if(maxMonth===-1) return [];return MONTHS.slice(0,maxMonth+1).map((m,i)=>({month:m,collected:FLATS.reduce((s,n)=>{const c=gc(n,currentYear,i);return s+(c.paid&&!c.advance?c.amount:0);},0)+getSpecialTotal(currentYear,i),expenses:data.expenses.filter(e=>e.year===currentYear&&e.month===i).reduce((s,e)=>s+e.amount,0)})).map(d=>({...d,balance:d.collected-d.expenses}));}
  function expBreakdown(){const bd={};data.expenses.filter(e=>e.year===currentYear&&e.month===currentMonth).forEach(e=>{bd[e.category]=(bd[e.category]||0)+e.amount;});return Object.entries(bd).map(([name,value])=>({name,value}));}
  function collectionRateData(){
    // "Expected" = sum of maintenance amounts for occupied flats only (owner or tenant).
    // Vacant flats have no expected dues so they are excluded from the denominator.
    return trendData().map((d,i)=>{
      const occupiedFlats=FLATS.filter(f=>getFlatStatus(f)!=="vacant");
      const totalPossible=occupiedFlats.reduce((s,f)=>{const c=gc(f,currentYear,i);return s+c.amount;},0);
      return{...d,rate:totalPossible>0?Math.round(d.collected/totalPossible*100):0};
    });
  }
  function topPendingFlats(){return FLATS.map(f=>{const p=getFlatPending(f);const fd=data.flats?.[f];const name=fd?.currentTenant?fd.currentTenant.name:fd?.ownerName||"Flat "+f;return{flat:"Flat "+f,name,pending:p.overdue+p.current};}).filter(f=>f.pending>0).sort((a,b)=>b.pending-a.pending).slice(0,8);}
  function yearlyExpBreakdown(){const bd={};data.expenses.filter(e=>e.year===currentYear).forEach(e=>{bd[e.category]=(bd[e.category]||0)+e.amount;});return Object.entries(bd).map(([name,value])=>({name,value}));}

  const ym={currentYear,setCurrentYear,currentMonth,setCurrentMonth};
  function cellClass(c,y,m){
    if(c.paid) return c.advance?"bg-purple-100 text-purple-700":"bg-emerald-100 text-emerald-700";
    if(isPast(y,m)||isCurrent(y,m)){
      // Check escalation level for current month
      return isCurrent(y,m)?"bg-yellow-100 text-yellow-700":"bg-red-100 text-red-600";
    }
    return "bg-gray-100 text-gray-400";
  }
  // Escalation-aware cell class — used in collections grid for current month
  function escalatedCellClass(c,y,m,flat){
    if(c.paid) return c.advance?"bg-purple-100 text-purple-700":"bg-emerald-100 text-emerald-700";
    if(isCurrent(y,m)){
      const lvl=escalationMap[flat];
      if(lvl==='escalated') return "bg-purple-200 text-purple-800 ring-1 ring-purple-400";
      if(lvl==='red')       return "bg-red-200 text-red-800 ring-1 ring-red-400";
      if(lvl==='amber')     return "bg-amber-100 text-amber-800 ring-1 ring-amber-300";
      return "bg-yellow-100 text-yellow-700";
    }
    if(isPast(y,m)) return "bg-red-100 text-red-600";
    return "bg-gray-100 text-gray-400";
  }
  function cellLabel(c,y,m){return c.paid?(c.advance?"ADV":"✓"):(isPast(y,m)?"✗":isCurrent(y,m)?"⏳":"—");}
  const tenantFields=[["Tenant Name","name","text"],["Phone","phone","text"],["Email","email","email"],["Move-in Date","moveInDate","date"],["Permanent Address","permanentAddress","text"],["Adults","adults","number"],["Children","children","number"],["ID Type","idType","text"],["ID Number","idNumber","text"],["Emergency Contact","emergencyContact","text"],["Relation","emergencyRelation","text"]];

  function getColDetail(flat){const c=gc(flat,currentYear,currentMonth);return{receivedDate:c.receivedDate||"",receivedFrom:c.receivedFrom||"",method:c.receivedMode||"Cash",note:c.note||""};}
  function updColDetail(flat,field,val){if(!isAdmin) return;setData(p=>{const key=currentYear+"-"+currentMonth;const col={...p.collections[flat]};const cur=col[key]||{amount:5000,paid:false,advance:false};const fieldMap={receivedDate:"receivedDate",receivedFrom:"receivedFrom",method:"receivedMode",note:"note"};col[key]={...cur,[fieldMap[field]]:val};return{...p,collections:{...p.collections,[flat]:col}};});}
  const monthPaidTotal=FLATS.reduce((s,f)=>{const c=gc(f,currentYear,currentMonth);return s+(c.paid&&!c.advance?c.amount:0);},0);
  const monthPaidCount=FLATS.filter(f=>{const c=gc(f,currentYear,currentMonth);return c.paid&&!c.advance;}).length;

  // ── Page routing ──────────────────────────────────────────
  if(view==="resident") return <ResidentDashboard data={data} setView={setView} navView={view} role={role} flatNumber={flatNumber} projectId={projectId} dataLoaded={dataLoaded}/>;
  if(view==="escalation") return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-orange-600 to-red-600 text-white p-6">
        <h1 className="text-3xl font-bold">🔔 Arrears Escalation</h1>
        <p className="text-orange-100 text-sm mt-1">Automated payment follow-up system</p>
      </header>
      <NavBar view={view} setView={setView} role={role}/>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <EscalationPanel
          escalationMap={escalationMap}
          data={data}
          FLATS={FLATS}
          config={escConfig}
          running={escRunning}
          lastRun={escLastRun}
          isAdmin={isAdmin}
          onRunEscalation={()=>{
            const proj=data?.building
            const supervisorPhone=null // will use project doc if available
            runEscalation(escalationSendWA, supervisorPhone, proj?.name)
          }}
        />
      </main>
    </div>
  );
  if(view==="complaints") return <ComplaintsPage db={db} projectId={projectId} setView={setView} navView={view} isAdmin={isAdmin} role={role} flatNumber={flatNumber} currentUser={currentUser}/>;
  if(view==="vendors") return <VendorsPage db={db} projectId={projectId} setView={setView} navView={view} isAdmin={isAdmin} role={role}/>;
  if(view==="notifications") return <NotificationsPage db={db} projectId={projectId} setView={setView} navView={view} isAdmin={isAdmin} role={role} data={data} flats={FLATS}/>;
  if(view==="meetings") return <MeetingsPage data={data} setData={setData} setView={setView} navView={view} isAdmin={isAdmin} role={role}/>;
  if (!dataLoaded) return (
  <div className="flex items-center justify-center h-screen bg-gray-100">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-gray-600 font-semibold">Loading apartment data...</p>
    </div>
  </div>
);
if(view==="audit") return <AuditPage data={data} setData={setData} setView={setView} isAdmin={isAdmin} role={role} flats={FLATS}/>;
  if(view==="incidents") return <IncidentsPage data={data} setData={setData} setView={setView} navView={view} isAdmin={isAdmin} role={role}/>;
  if(view==="watchman") return <WatchmanPage data={data} setData={setData} setView={setView} navView={view} isAdmin={isAdmin} role={role}/>;
  if(view==="special") return <SpecialPage data={data} setData={setData} setView={setView} navView={view} isAdmin={isAdmin} role={role} flats={FLATS}/>;

  if(view==="expenseDetail"&&selectedExpEntry){
    const allEntries=selectedExpEntry.mode==="cat"?data.expenses.filter(e=>e.category===selectedExpEntry.category):data.expenses.filter(e=>e.subcategory===selectedExpEntry.subcategory);
    return <ExpDetailView title={selectedExpEntry.mode==="cat"?selectedExpEntry.category:selectedExpEntry.subcategory} subtitle={selectedExpEntry.mode==="cat"?"Category Summary":"Item Summary"} allEntries={allEntries} onBack={()=>setView("expenses")} navView={view} setView={setView} role={role}/>;
  }

  if(view==="pendingCollections"){
    const grandTotal=FLATS.reduce((s,f)=>{const p=getFlatPending(f);return s+p.overdue+p.current;},0);
    return(
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6"><button onClick={()=>setView("dashboard")} className="text-orange-100 hover:text-white mb-2 font-semibold text-sm">← Dashboard</button><h1 className="text-3xl font-bold">⏳ Pending Collections</h1><p className="text-orange-100 mt-1">Outstanding: <span className="font-bold text-white text-xl">₹{grandTotal.toLocaleString()}</span></p></header>
        <main className="max-w-full px-4 py-6"><div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">{FLATS.map(flat=>{const p=getFlatPending(flat);const total=p.overdue+p.current;if(total===0) return null;const f=data.flats[flat];const name=f.currentTenant?f.currentTenant.name:f.ownerName;return(<div key={flat} onClick={()=>{setSelectedFlat(flat);setView("flatDetail");}} className="bg-white rounded-xl border-l-4 border-orange-400 shadow p-3 cursor-pointer hover:shadow-md transition"><p className="text-lg font-bold text-blue-600">{flat}</p><p className="text-xs text-gray-500 truncate">{name}</p><p className="text-sm font-bold text-orange-600 mt-1">₹{total.toLocaleString()}</p></div>);})}</div></main>
      </div>
    );
  }

  if(view==="filteredFlats"){
    const fs=selectedFlat;
    const list=FLATS.filter(f=>getFlatStatus(f)===fs);
    return <div className="min-h-screen bg-gray-50"><header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6"><button onClick={()=>setView("dashboard")} className="text-blue-100 hover:text-white mb-2 font-semibold text-sm">← Back</button><h1 className="text-3xl font-bold">{fs==="owner"?"Owner Occupied":fs==="tenant"?"Rented":"Vacant"} ({list.length})</h1></header><main className="max-w-7xl mx-auto px-6 py-8"><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{list.map(flat=>{const f=data.flats[flat];const name=fs==="tenant"&&f.currentTenant?f.currentTenant.name:f.ownerName||"";return(<button key={flat} onClick={()=>{setSelectedFlat(flat);setView("flatDetail");}} className="p-4 bg-blue-600 text-white rounded-lg hover:shadow-lg transition text-left"><p className="text-2xl font-bold">{flat}</p>{name&&<p className="text-sm mt-1 opacity-90">{name}</p>}</button>);})}</div></main></div>;
  }

  if(view==="flatDetail"&&selectedFlat&&typeof selectedFlat==="number"){

    const flat=data.flats[selectedFlat];const tenant=flat.currentTenant;const status=getFlatStatus(selectedFlat);const ledger=data.paymentLedger[selectedFlat]||[];const pend=getFlatPending(selectedFlat);
    return(
      <div className="min-h-screen bg-gray-50">
        {showRecordPmt&&isAdmin&&<RecordPaymentModal paymentFlat={paymentFlat} flatData={data.flats[paymentFlat]} collections={data.collections} onClose={()=>setShowRecordPmt(false)} onSubmit={submitPayment} isAdmin={isAdmin}/>}
        <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
          <button onClick={()=>{setView("dashboard");setAddingTenant(false);}} className="text-blue-100 hover:text-white mb-2 font-semibold text-sm">← Back</button>
          <div className="flex items-center justify-between"><div className="flex items-center gap-3"><h1 className="text-3xl font-bold">Flat {selectedFlat}</h1><StatusBadge status={status}/></div>{isAdmin&&<button onClick={()=>openRecordPmt(selectedFlat)} className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 rounded-lg font-bold text-sm hover:bg-blue-50"><CreditCard size={16}/> Record Payment</button>}</div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          {(pend.overdue>0||pend.current>0)&&<div className="bg-orange-50 border border-orange-300 rounded-xl p-4 flex flex-wrap gap-4 items-center justify-between"><div><p className="font-bold text-orange-700">⚠️ Outstanding Balance</p>{pend.overdue>0&&<p className="text-sm text-red-600">Overdue: <strong>₹{pend.overdue.toLocaleString()}</strong></p>}{pend.current>0&&<p className="text-sm text-yellow-700">Current: <strong>₹{pend.current.toLocaleString()}</strong></p>}</div>{isAdmin&&<button onClick={()=>openRecordPmt(selectedFlat)} className="px-4 py-2 bg-orange-500 text-white rounded-lg font-bold text-sm hover:bg-orange-600">💳 Collect</button>}</div>}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-5">👤 Owner Details</h2>
            {!canViewPersonal&&!isOwnFlat&&<div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3 mb-4"><span className="text-xl">ℹ️</span><p className="text-xs text-blue-700 font-semibold">Phone, email and contact details are only visible to the flat owner and admins.</p></div>}
            {(canViewPersonal||isOwnFlat||role==="resident")&&<><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">{[["Full Name","ownerName","text"],["📞 Phone","ownerPhone","text"],["✉️ Email","ownerEmail","email"],["Alternate Contact","ownerAltName","text"],["Alt. Phone","ownerAltPhone","text"],["Relation","ownerAltRelation","text"],["📅 Staying Since","ownerStayingSince","date"],["👥 Adults","ownerAdults","number"],["👧 Kids","ownerKids","number"]].map(([label,field,type])=>{const isPrivate=["ownerPhone","ownerEmail","ownerAltName","ownerAltPhone","ownerAltRelation","ownerAdults","ownerKids"].includes(field);const canSeeField=canViewPersonal||isOwnFlat||!isPrivate;if(!canSeeField) return null;return(<div key={field} className="bg-gray-50 rounded-xl p-4 border"><p className="text-xs font-bold text-gray-400 uppercase mb-2">{label}</p>{isAdmin?<input type={type} value={flat[field]||""} onChange={e=>updateFlat(selectedFlat,{[field]:e.target.value})} className="w-full bg-transparent text-lg font-semibold text-gray-800 border-b border-gray-300 focus:border-blue-500 outline-none pb-1"/>:<p className="text-lg font-semibold text-gray-800">{flat[field]||"—"}</p>}</div>);})}</div>
            {isAdmin&&(
  <div className="border-t pt-4"><p className="text-xs font-semibold text-gray-600 mb-3">OCCUPANCY</p><div className="flex gap-3"><button onClick={()=>markOwnerOccupied(selectedFlat)} className={"px-4 py-2 rounded-lg text-sm font-semibold border-2 transition "+(status==="owner"?"border-blue-600 bg-blue-600 text-white":"border-blue-300 text-blue-600 hover:bg-blue-50")}>🏠 Owner Stays</button><button onClick={()=>markForRent(selectedFlat)} className={"px-4 py-2 rounded-lg text-sm font-semibold border-2 transition "+(status!=="owner"?"border-green-600 bg-green-600 text-white":"border-green-300 text-green-600 hover:bg-green-50")}>🔑 Rented / Vacant</button><button onClick={()=>{if(window.confirm("Are you sure you want to mark this property as sold?")) markOwnerSold(selectedFlat);}} className="px-4 py-2 rounded-lg text-sm font-semibold border-2 border-red-300 text-red-600 hover:bg-red-50">💼 Owner Sold</button></div></div>
)}
            {/* {isAdmin&&( */}
              {/* <div className="border-t pt-4"><p className="text-xs font-semibold text-gray-600 mb-3">OCCUPANCY</p><div className="flex gap-3"><button onClick={()=>markOwnerOccupied(selectedFlat)} className={"px-4 py-2 rounded-lg text-sm font-semibold border-2 transition "+(status==="owner"?"border-blue-600 bg-blue-600 text-white":"border-blue-300 text-blue-600 hover:bg-blue-50")}>🏠 Owner Stays</button><button onClick={()=>markForRent(selectedFlat)} className={"px-4 py-2 rounded-lg text-sm font-semibold border-2 transition "+(status!=="owner"?"border-green-600 bg-green-600 text-white":"border-green-300 text-green-600 hover:bg-green-50")}>🔑 Rented / Vacant</button></div></div> */}
            {/* )} */}
            </>}
          </div>
          {status!=="owner"&&(<div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <div className="flex justify-between items-center mb-5"><h2 className="text-xl font-bold">🧑‍💼 Tenant Details</h2>{isAdmin&&tenant&&!addingTenant&&canViewPersonal&&<button onClick={()=>{if(window.confirm("Are you sure you want to vacate this tenant?")) vacateFlat(selectedFlat);}} className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 font-semibold">Vacate</button>}</div>
            {!canViewPersonal&&!isOwnFlat&&<div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3 mb-4"><span className="text-xl">ℹ️</span><p className="text-xs text-blue-700 font-semibold">Phone, email and contact details are only visible to the flat owner and admins.</p></div>}
            {(canViewPersonal||isOwnFlat||role==="resident")&&<>{!tenant&&!addingTenant&&<div className="text-center py-8 bg-gray-50 rounded-lg"><p className="text-4xl mb-3">🏚️</p><p className="text-gray-500 mb-4">Flat is vacant</p>{isAdmin&&<button onClick={()=>{setDraftTenant(emptyTenant());setAddingTenant(true);}} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm">+ Add Tenant</button>}</div>}
            {addingTenant&&isAdmin&&<div className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{tenantFields.map(([label,field,type])=>(<div key={field}><label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label><input type={type} value={draftTenant[field]||""} onChange={e=>setDraftTenant({...draftTenant,[field]:type==="number"?parseInt(e.target.value)||0:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>))}</div><div className="flex gap-3"><button onClick={()=>saveTenant(selectedFlat)} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm">✓ Save</button><button onClick={()=>setAddingTenant(false)} className="px-6 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div></div>}
            {tenant&&!addingTenant&&<div className="grid grid-cols-1 md:grid-cols-2 gap-4">{tenantFields.filter(([label,field])=>{const privateFields=["phone","email","permanentAddress","emergencyContact","emergencyRelation","idType","idNumber"];return canViewPersonal||isOwnFlat||!privateFields.includes(field);}).map(([label,field,type])=>(<div key={field}><label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>{isAdmin?<input type={type} value={tenant[field]||""} onChange={e=>updTenant(selectedFlat,field,type==="number"?parseInt(e.target.value)||0:e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm"/>:<p className="px-3 py-2 bg-gray-50 border rounded-lg text-sm">{tenant[field]||"—"}</p>}</div>))}</div>}
            </>}
          </div>)}
          {/* History Section */}
          {(flat.previousOwners?.length > 0 || flat.tenantHistory?.length > 0) && (
  <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
    <h2 className="text-xl font-bold mb-5">📜 History</h2>
    {!canViewPersonal&&!isOwnFlat&&<div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3"><span className="text-3xl">🔒</span><div><p className="font-bold text-amber-800">Past Owner & Tenant History — Restricted</p><p className="text-xs text-amber-600 mt-0.5">Previous owner and past tenant details are only visible to the flat owner and admins.</p></div></div>}
    {(canViewPersonal||isOwnFlat)&&<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {flat.previousOwners?.length > 0 && (
        <div>
          <h3 className="font-bold text-purple-700 mb-3">Previous Owners</h3>
          <div className="space-y-3">
            {flat.previousOwners.map((owner, idx) => (
              <div key={idx} className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="font-semibold text-gray-800">{owner.name}</p>
                <div className="text-xs text-gray-600 space-y-1 mt-2 border-t pt-2">
                  {owner.phone && <p>📞 <span className="font-medium">{owner.phone}</span></p>}
                  {owner.email && <p>✉️ <span className="font-medium">{owner.email}</span></p>}
                  {owner.altName && <p>👤 Alt: <span className="font-medium">{owner.altName}</span></p>}
                  {owner.altPhone && <p>📱 Alt Phone: <span className="font-medium">{owner.altPhone}</span></p>}
                  {owner.altRelation && <p>👥 Relation: <span className="font-medium">{owner.altRelation}</span></p>}
                  {owner.stayingSince && <p>📅 Stayed Since: <span className="font-medium">{fmtIndian(owner.stayingSince)}</span></p>}
                  {owner.saleDate && <p className="text-purple-600 font-semibold">💼 Sold: {fmtIndian(owner.saleDate)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {flat.tenantHistory?.length > 0 && (
        <div>
          <h3 className="font-bold text-green-700 mb-3">Past Tenants</h3>
          <div className="space-y-3">
            {flat.tenantHistory.map((tenant, idx) => (
              <div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                <div>
                  <p className="font-semibold text-gray-800">{tenant.name}</p>
                  <div className="text-xs text-gray-600 space-y-1 mt-1 border-b pb-2">
                    {tenant.phone && <p>📞 <span className="font-medium">{tenant.phone}</span></p>}
                    {tenant.email && <p>✉️ <span className="font-medium">{tenant.email}</span></p>}
                  </div>
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  {tenant.moveInDate && <p>📅 Moved In: <span className="font-medium">{fmtIndian(tenant.moveInDate)}</span></p>}
                  {tenant.moveOutDate && <p>🚪 Moved Out: <span className="font-medium text-red-600">{fmtIndian(tenant.moveOutDate)}</span></p>}
                </div>
                {(tenant.permanentAddress || tenant.adults || tenant.children) && (
                  <div className="text-xs text-gray-600 space-y-1 border-t pt-2">
                    {tenant.permanentAddress && <p>🏠 <span className="font-medium">{tenant.permanentAddress}</span></p>}
                    {(tenant.adults || tenant.children) && <p>👥 {tenant.adults || 0} Adults, {tenant.children || 0} Children</p>}
                  </div>
                )}
                {(tenant.emergencyContact || tenant.emergencyRelation) && (
                  <div className="text-xs text-red-600 space-y-1 border-t pt-2">
                    <p className="font-semibold">Emergency Contact</p>
                    {tenant.emergencyContact && <p>{tenant.emergencyContact}</p>}
                    {tenant.emergencyRelation && <p>({tenant.emergencyRelation})</p>}
                  </div>
                )}
                {(tenant.idType || tenant.idNumber) && (
                  <div className="text-xs text-gray-600 space-y-1 border-t pt-2">
                    <p className="font-semibold">ID Info</p>
                    {tenant.idType && <p>{tenant.idType}: <span className="font-medium">{tenant.idNumber || "—"}</span></p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>}
  </div>
)}
          {ledger.length>0&&<div className="bg-white rounded-lg shadow p-6"><h2 className="text-xl font-bold mb-4">📒 Payment Ledger</h2><div className="space-y-3">{ledger.slice().reverse().map(entry=>(<div key={entry.id} className="bg-green-50 border border-green-200 rounded-xl p-4"><div className="flex justify-between items-start"><p className="font-bold text-green-700">₹{entry.amount.toLocaleString()} received</p><p className="text-xs text-gray-400">{entry.months.length} month{entry.months.length>1?"s":""}</p></div><div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-600">{entry.date&&<span>📅 {fmtIndian(entry.date)}</span>}{entry.method&&<span>💳 {entry.method}</span>}{entry.receivedFrom&&<span>👤 {entry.receivedFrom}</span>}</div><div className="flex flex-wrap gap-1.5 mt-2">{entry.months.map(m=><span key={m.key} className="px-2 py-0.5 bg-green-200 text-green-800 rounded-full text-xs font-semibold">{MONTHS[m.month]} {m.year}</span>)}</div></div>))}</div></div>}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">💰 Payment History</h2><div className="flex gap-2"><select value={currentYear} onChange={e=>setCurrentYear(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg text-sm font-semibold">{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>{isAdmin&&<button onClick={()=>openRecordPmt(selectedFlat)} className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"><CreditCard size={14}/> Record</button>}</div></div>
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-gray-50"><tr>{MONTHS.map((m,i)=><th key={i} className={"px-3 py-2 text-center font-semibold "+(isCurrent(currentYear,i)?"bg-yellow-50 text-yellow-700":"text-gray-600")}>{m}</th>)}</tr></thead><tbody><tr>{MONTHS.map((_,i)=>{const c=gc(selectedFlat,currentYear,i);return(<td key={i} className="px-1 py-3 text-center"><input type="number" value={c.amount} onChange={e=>updateAmt(selectedFlat,currentYear,i,e.target.value)} disabled={!isAdmin} className="w-16 px-1 py-1 text-center border rounded text-xs font-semibold mb-1 disabled:bg-gray-50"/><button onClick={()=>togglePayment(selectedFlat,currentYear,i)} disabled={!isAdmin} className={"w-full px-1 py-1 rounded text-xs font-bold "+cellClass(c,currentYear,i)+(isAdmin?" cursor-pointer hover:opacity-75":" cursor-default")}>{cellLabel(c,currentYear,i)}</button></td>);})}</tr></tbody></table></div>
          </div>
        </main>
      </div>
    );
  }

  // ── Expenses ──────────────────────────────────────────────
  if(view==="expenses"){
    const cats=data.expenseCategories;const subs=cats[newExpense.category]||[];
    const allExpenses=applyExpFilter(data.expenses,expFilter);
    const monthExpenses=data.expenses.filter(e=>e.year===currentYear&&e.month===currentMonth);
    return(
      <div className="min-h-screen bg-gray-50">
        {showCatMgr&&<CategoryManager cats={cats} onClose={()=>setShowCatMgr(false)} onAddCat={onAddCat} onDeleteCat={onDeleteCat} onRenameCat={onRenameCat} onAddSub={onAddSub} onDeleteSub={onDeleteSub} onRenameSub={onRenameSub} isAdmin={isAdmin}/>}
        <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6"><h1 className="text-3xl font-bold">Expense Tracker</h1></header>
        <NavBar view={view} setView={setView} role={role}/>
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          <ExpFilterBar filter={expFilter} setFilter={setExpFilter} entries={data.expenses}/>
          <div className="grid grid-cols-3 gap-4"><MetricCard label="Total (filtered)" value={"₹"+allExpenses.reduce((s,e)=>s+e.amount,0).toLocaleString()} bg="bg-orange-50" borderColor="border-orange-400"/><MetricCard label={MONTHS[currentMonth]+" "+currentYear} value={"₹"+monthExpenses.reduce((s,e)=>s+e.amount,0).toLocaleString()} bg="bg-red-50" borderColor="border-red-400"/><MetricCard label="Entries (filtered)" value={allExpenses.length} bg="bg-purple-50" borderColor="border-purple-400"/></div>
          <div className="flex justify-between items-center flex-wrap gap-3"><YMSel {...ym}/><div className="flex gap-2">{isAdmin&&<><button onClick={()=>setShowCatMgr(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold text-sm"><Settings size={15}/> Categories</button><button onClick={()=>{setEditingExpense(null);setNewExpense({category:Object.keys(cats)[0]||"",subcategory:(Object.values(cats)[0]||[])[0]||"",amount:"",units:"",unitType:"monthly"});setShowAddExpense(!showAddExpense);}} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm"><Plus size={16}/> Add Expense</button></>}</div></div>
          {showAddExpense&&isAdmin&&(<div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500"><h3 className="font-bold mb-4">{editingExpense?"Edit":"New"} Expense — {MONTHS[currentMonth]} {currentYear}</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4"><div><label className="block text-xs font-semibold text-gray-600 mb-1">Category</label><select value={newExpense.category} onChange={e=>{const c=e.target.value;setNewExpense({...newExpense,category:c,subcategory:(cats[c]||[])[0]||""});}} className="w-full px-3 py-2 border rounded-lg text-sm">{Object.keys(cats).map(c=><option key={c}>{c}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Sub-Category</label><select value={newExpense.subcategory} onChange={e=>setNewExpense({...newExpense,subcategory:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{subs.map(s=><option key={s}>{s}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Amount (₹)</label><input type="number" value={newExpense.amount} onChange={e=>setNewExpense({...newExpense,amount:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Units</label><input type="number" value={newExpense.units} onChange={e=>setNewExpense({...newExpense,units:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Unit Type</label><input type="text" value={newExpense.unitType} onChange={e=>setNewExpense({...newExpense,unitType:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div></div><div className="flex gap-2"><button onClick={addExpense} className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm">Save</button><button onClick={()=>{setShowAddExpense(false);setEditingExpense(null);}} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div></div>)}

          {/* ── Expense Analytics Charts (responds to filter bar above) ── */}
          {allExpenses.length>0&&(()=>{
            // Monthly spend trend
            const monthlyMap={};
            allExpenses.forEach(e=>{const k=e.year+"-"+String(e.month).padStart(2,"0");monthlyMap[k]=(monthlyMap[k]||0)+e.amount;});
            const monthlyTrend=Object.entries(monthlyMap).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>{const[y,m]=k.split("-");return{label:MONTHS[parseInt(m)]+" '"+y.slice(2),amount:v};});
            // Category breakdown
            const catMap={};allExpenses.forEach(e=>{catMap[e.category]=(catMap[e.category]||0)+e.amount;});
            const catData=Object.entries(catMap).sort(([,a],[,b])=>b-a).map(([name,value])=>({name,value}));
            // Sub-item breakdown (top 8)
            const subMap={};allExpenses.forEach(e=>{subMap[e.subcategory]=(subMap[e.subcategory]||0)+e.amount;});
            const subData=Object.entries(subMap).sort(([,a],[,b])=>b-a).slice(0,8).map(([name,value])=>({name,value}));
            const total=allExpenses.reduce((s,e)=>s+e.amount,0);
            return(
              <div className="space-y-4">
                {/* Row 1 — Monthly Trend */}
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold">📅 Monthly Expenditure Trend</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Filter: {expFilter==="all"?"All Time":expFilter==="3m"?"Last 3M":expFilter==="6m"?"Last 6M":expFilter==="1y"?"Last 1Y":expFilter==="lastyear"?"Last Cal. Year":expFilter}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">Which months had the highest spend</p>
                  {monthlyTrend.length===1
                    ?<div className="flex items-center gap-4 py-4"><div className="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-400"><p className="text-xs text-gray-500">Single month selected</p><p className="text-2xl font-bold text-orange-700">₹{monthlyTrend[0].amount.toLocaleString()}</p><p className="text-sm text-gray-600">{monthlyTrend[0].label}</p></div></div>
                    :<ResponsiveContainer width="100%" height={180}><BarChart data={monthlyTrend} margin={{left:10,right:10}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label" tick={{fontSize:10}} angle={monthlyTrend.length>6?-30:0} textAnchor={monthlyTrend.length>6?"end":"middle"} height={monthlyTrend.length>6?50:30}/><YAxis tick={{fontSize:10}} tickFormatter={v=>"₹"+v.toLocaleString()}/><Tooltip formatter={v=>["₹"+v.toLocaleString(),"Expenses"]}/><Bar dataKey="amount" radius={[3,3,0,0]}>{monthlyTrend.map((d,i)=>{const max=Math.max(...monthlyTrend.map(x=>x.amount));return <Cell key={i} fill={d.amount===max?"#ef4444":"#f97316"}/>;})}</Bar></BarChart></ResponsiveContainer>}
                </div>
                {/* Row 2 — Category + Sub-item side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Driving Categories */}
                  <div className="bg-white rounded-lg shadow p-5">
                    <h3 className="font-bold mb-1">🏷️ What's Driving Expenses</h3>
                    <p className="text-xs text-gray-400 mb-3">Categories ranked by total spend in selected period</p>
                    <ResponsiveContainer width="100%" height={200}><BarChart data={catData} layout="vertical" margin={{left:0,right:30}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>"₹"+v.toLocaleString()}/><YAxis type="category" dataKey="name" tick={{fontSize:10}} width={130}/><Tooltip formatter={v=>["₹"+v.toLocaleString(),"Total"]} labelFormatter={(_,p)=>p?.[0]?.payload?.name||""}/><Bar dataKey="value" radius={[0,3,3,0]}>{catData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar></BarChart></ResponsiveContainer>
                    <div className="mt-3 space-y-1">{catData.map((d,i)=><div key={i} className="flex justify-between items-center text-xs"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{background:COLORS[i%COLORS.length]}}></div><span className="text-gray-700 truncate max-w-[160px]">{d.name}</span></div><span className="font-semibold text-gray-800">{Math.round(d.value/total*100)}%</span></div>)}</div>
                  </div>
                  {/* Top Sub-items */}
                  <div className="bg-white rounded-lg shadow p-5">
                    <h3 className="font-bold mb-1">🔍 Top Expense Items</h3>
                    <p className="text-xs text-gray-400 mb-3">Individual line items by total spend (top 8)</p>
                    <ResponsiveContainer width="100%" height={200}><BarChart data={subData} layout="vertical" margin={{left:0,right:30}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>"₹"+v.toLocaleString()}/><YAxis type="category" dataKey="name" tick={{fontSize:10}} width={130}/><Tooltip formatter={v=>["₹"+v.toLocaleString(),"Total"]} labelFormatter={(_,p)=>p?.[0]?.payload?.name||""}/><Bar dataKey="value" radius={[0,3,3,0]}>{subData.map((_,i)=><Cell key={i} fill={i===0?"#ef4444":i===1?"#f97316":i===2?"#f59e0b":"#6366f1"}/>)}</Bar></BarChart></ResponsiveContainer>
                    <div className="mt-3 space-y-1">{subData.map((d,i)=><div key={i} className="flex justify-between items-center text-xs"><span className="text-gray-700 truncate max-w-[180px]">{i===0?"🔴":i===1?"🟠":i===2?"🟡":"🔵"} {d.name}</span><span className="font-semibold text-gray-800">₹{d.value.toLocaleString()}</span></div>)}</div>
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="bg-white rounded-lg shadow overflow-x-auto"><div className="px-5 py-3 border-b flex justify-between items-center"><h3 className="font-bold">{MONTHS[currentMonth]} {currentYear}</h3></div><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Category</th><th className="px-4 py-3 text-left">Item</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Units</th>{isAdmin&&<th className="px-4 py-3 text-center">Actions</th>}</tr></thead><tbody>{monthExpenses.length===0&&<tr><td colSpan={5} className="text-center py-10 text-gray-400">No expenses for {MONTHS[currentMonth]} {currentYear}</td></tr>}{monthExpenses.map(e=>(<tr key={e.id} className="border-t hover:bg-gray-50"><td className="px-4 py-3"><button onClick={()=>{setSelectedExpEntry({category:e.category,mode:"cat"});setView("expenseDetail");}} className="text-blue-600 font-semibold hover:underline text-left">{e.category}</button></td><td className="px-4 py-3"><button onClick={()=>{setSelectedExpEntry({category:e.category,subcategory:e.subcategory,mode:"item"});setView("expenseDetail");}} className="text-indigo-600 font-semibold hover:underline text-left">{e.subcategory}</button></td><td className="px-4 py-3 text-right">₹{e.amount.toLocaleString()}</td><td className="px-4 py-3 text-right text-gray-500">{e.units} {e.unitType}</td>{isAdmin&&<td className="px-4 py-3 text-center"><div className="flex gap-2 justify-center"><button onClick={()=>{setEditingExpense(e);setNewExpense({category:e.category,subcategory:e.subcategory,amount:e.amount.toString(),units:e.units.toString(),unitType:e.unitType});setShowAddExpense(true);}} className="text-blue-500 hover:text-blue-700"><Edit2 size={15}/></button><button onClick={()=>deleteExpense(e.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15}/></button></div></td>}</tr>))}</tbody>{monthExpenses.length>0&&<tfoot className="bg-gray-50 border-t-2"><tr><td colSpan={2} className="px-4 py-3 font-bold">Total</td><td className="px-4 py-3 text-right font-bold text-emerald-700">₹{monthExpenses.reduce((s,e)=>s+e.amount,0).toLocaleString()}</td><td colSpan={isAdmin?2:1}></td></tr></tfoot>}</table></div>
        </main>
      </div>
    );
  }

  // ── Collections ───────────────────────────────────────────
  if(view==="collections"){
    return(
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6"><h1 className="text-3xl font-bold">Collections Tracker</h1></header>
        <NavBar view={view} setView={setView} role={role}/>
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-3 items-center flex-wrap">
              <YMSel {...ym}/>
              {isAdmin&&colView==="year"&&<button onClick={()=>setShowBulkAdd(!showBulkAdd)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm"><Plus size={16}/> Bulk Add</button>}
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setColView("year")} className={"px-4 py-2 rounded-lg text-xs font-bold border-2 transition "+(colView==="year"?"bg-blue-600 text-white border-blue-600":"border-blue-300 text-blue-600 hover:bg-blue-50")}>📅 Year Grid</button>
              <button onClick={()=>setColView("month")} className={"px-4 py-2 rounded-lg text-xs font-bold border-2 transition "+(colView==="month"?"bg-blue-600 text-white border-blue-600":"border-blue-300 text-blue-600 hover:bg-blue-50")}>📋 Month Detail</button>
            </div>
          </div>
          {showBulkAdd&&isAdmin&&colView==="year"&&(<div className="bg-blue-50 border border-blue-200 rounded-lg p-5"><h3 className="font-bold mb-3">Bulk Add — {MONTHS[currentMonth]} {currentYear}</h3><input type="number" value={bulkAmount} onChange={e=>setBulkAmount(e.target.value)} placeholder="Amount ₹" className="px-3 py-2 border rounded-lg text-sm mr-3"/><div className="flex flex-wrap gap-2 my-3">{FLATS.map(f=><button key={f} onClick={()=>setExcludedFlats(excludedFlats.includes(f)?excludedFlats.filter(x=>x!==f):[...excludedFlats,f])} className={"px-2 py-1 rounded text-xs font-bold "+(excludedFlats.includes(f)?"bg-red-200 text-red-700":"bg-green-100 text-green-700")}>{f}</button>)}</div><div className="flex gap-2"><button onClick={bulkAdd} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold text-sm">Apply to {FLATS.length-excludedFlats.length} flats</button><button onClick={()=>setShowBulkAdd(false)} className="px-4 py-2 bg-gray-400 text-white rounded font-semibold text-sm">Cancel</button></div></div>)}
          {colView==="year"&&(
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left sticky left-0 bg-gray-50">Flat</th><th className="px-3 py-2 text-left">Status</th>{MONTHS.map((m,i)=><th key={i} className={"px-2 py-2 text-center "+(isCurrent(currentYear,i)?"bg-yellow-50":"")}>{m}<br/><span className="text-gray-400 font-normal">{currentYear}</span></th>)}</tr></thead>
              <tbody>{FLATS.map(flat=>(<tr key={flat} className="border-t hover:bg-gray-50"><td className="px-3 py-2 font-bold text-blue-600 cursor-pointer sticky left-0 bg-white hover:bg-blue-50" onClick={()=>{setSelectedFlat(flat);setAddingTenant(false);setView("flatDetail");}}>{flat}</td><td className="px-3 py-2"><StatusBadge status={getFlatStatus(flat)}/></td>{MONTHS.map((_,i)=>{const c=gc(flat,currentYear,i);return <td key={i} className="px-1 py-2 text-center"><div onClick={()=>requestToggle(flat,currentYear,i)} className={"text-xs font-bold rounded px-1 py-1 "+(isAdmin?"cursor-pointer hover:opacity-80":"")+cellClass(c,currentYear,i)}>₹{c.amount}</div></td>;})}
              </tr>))}</tbody></table>
            </div>
          )}
          {colView==="month"&&(
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-bold">{MONTHS[currentMonth]} {currentYear}</h3><p className="text-xs text-gray-500">{monthPaidCount}/{FLATS.length} paid · ₹{monthPaidTotal.toLocaleString()}</p></div>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-blue-50"><tr><th className="px-4 py-3 text-left">Flat</th><th className="px-4 py-3 text-left">Resident</th><th className="px-4 py-3 text-center">Amount</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">From</th><th className="px-4 py-3 text-left">Mode</th><th className="px-4 py-3 text-left">Note</th></tr></thead>
              <tbody>{FLATS.map(flat=>{const c=gc(flat,currentYear,currentMonth);const fd=data.flats?.[flat];if(!fd) return null;const name=fd.currentTenant?fd.currentTenant.name:fd.ownerName;const det=getColDetail(flat);const paid=c.paid&&!c.advance;return(<tr key={flat} className={"border-t "+(paid?"bg-green-50":"hover:bg-orange-50")}><td className="px-4 py-2 font-bold text-blue-600 cursor-pointer hover:underline" onClick={()=>{setSelectedFlat(flat);setView("flatDetail");}}>{flat}</td><td className="px-4 py-2 text-xs font-medium">{name}</td><td className="px-4 py-2 text-center">{isAdmin?<input type="number" value={c.amount} onChange={e=>updateAmt(flat,currentYear,currentMonth,e.target.value)} className="w-20 px-2 py-1 border rounded text-sm text-center font-semibold"/>:<span className="font-semibold">₹{c.amount}</span>}</td><td className="px-4 py-2 text-center"><button onClick={()=>isAdmin&&requestToggle(flat,currentYear,currentMonth)} disabled={!isAdmin} className={"px-3 py-1 rounded text-xs font-bold border "+(paid?"bg-green-100 text-green-700 border-green-300":c.advance?"bg-purple-100 text-purple-700 border-purple-300":"bg-orange-100 text-orange-600 border-orange-300")+(isAdmin?" cursor-pointer":" cursor-default")}>{c.paid?(c.advance?"⏫ Advance":"✓ Paid"):"⏳ Pending"}</button></td><td className="px-4 py-2">{isAdmin?<input type="date" value={det.receivedDate} onChange={e=>updColDetail(flat,"receivedDate",e.target.value)} className="px-2 py-1 border rounded text-xs w-32"/>:<span className="text-xs">{det.receivedDate||"—"}</span>}</td><td className="px-4 py-2">{isAdmin?<input type="text" value={det.receivedFrom} onChange={e=>updColDetail(flat,"receivedFrom",e.target.value)} placeholder="Name..." className="px-2 py-1 border rounded text-xs w-28"/>:<span className="text-xs">{det.receivedFrom||"—"}</span>}</td><td className="px-4 py-2">{isAdmin?<select value={det.method} onChange={e=>updColDetail(flat,"method",e.target.value)} className="px-2 py-1 border rounded text-xs">{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select>:<span className="text-xs">{det.method}</span>}</td><td className="px-4 py-2">{isAdmin?<input type="text" value={det.note} onChange={e=>updColDetail(flat,"note",e.target.value)} placeholder="Note..." className="px-2 py-1 border rounded text-xs w-28"/>:<span className="text-xs text-gray-500">{det.note||"—"}</span>}</td></tr>);})}</tbody>
              <tfoot className="bg-blue-50 border-t-2"><tr><td colSpan={2} className="px-4 py-3 font-bold">Total</td><td className="px-4 py-3 text-center font-bold">₹{monthPaidTotal.toLocaleString()}</td><td colSpan={5} className="px-4 py-3 text-xs text-gray-500">{monthPaidCount} flats paid</td></tr></tfoot>
              </table></div>
            </div>
          )}
        </main>
        {confirmPmt&&confirmPmtInfo&&(
          <ConfirmModal
            title={confirmPmtInfo.cur.paid?"Mark as Pending?":"Mark as Paid?"}
            message={`Flat ${confirmPmtInfo.flatId} — ${confirmPmtInfo.monthLabel}`}
            subMessage={confirmPmtInfo.cur.paid?"This will revert the payment status to pending.":"This will mark the maintenance as received."}
            confirmLabel={confirmPmtInfo.cur.paid?"Yes, Mark Pending":"Yes, Mark Paid"}
            confirmClass={confirmPmtInfo.cur.paid?"bg-orange-500 hover:bg-orange-600":"bg-emerald-600 hover:bg-emerald-700"}
            onConfirm={confirmToggle}
            onCancel={()=>setConfirmPmt(null)}
          />
        )}
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────
  return(
    <div className="min-h-screen bg-gray-50">
      {showCsvModal&&<CsvModal onClose={()=>setShowCsvModal(false)} onImport={onImport} isAdmin={isAdmin}/>}
      {showRecordPmt&&paymentFlat&&isAdmin&&<RecordPaymentModal paymentFlat={paymentFlat} flatData={data.flats[paymentFlat]} collections={data.collections} onClose={()=>setShowRecordPmt(false)} onSubmit={submitPayment} isAdmin={isAdmin}/>}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3"><Home size={30}/><div><h1 className="text-2xl font-bold">{data.building.name}</h1><p className="text-blue-100 text-sm">{data.building.totalFlats} Flats</p></div></div>
          <div className="flex gap-2 flex-wrap justify-end">
            {isAdmin&&<button onClick={()=>setShowCsvModal(true)} className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg text-sm font-semibold hover:bg-green-600"><Upload size={15}/> CSV</button>}
            <button onClick={downloadData} className="flex items-center gap-2 px-3 py-2 bg-white text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-50"><Download size={16}/> Export</button>
          </div>
        </div>
      </header>
      <NavBar view={view} setView={setView} role={role}/>
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Total Flats" value={FLATS.length} bg="bg-blue-50"/>
          <MetricCard label="Owner Occupied" value={stats.owners} bg="bg-blue-50" onClick={()=>{setSelectedFlat("owner");setView("filteredFlats");}}/>
          <MetricCard label="Rented" value={stats.tenants} bg="bg-green-50" onClick={()=>{setSelectedFlat("tenant");setView("filteredFlats");}}/>
          <MetricCard label="Vacant" value={stats.vacant} bg="bg-red-50" onClick={()=>{setSelectedFlat("vacant");setView("filteredFlats");}}/>
        </div>
        <YMSel {...ym}/>
        {isYearFrozen(currentYear)&&<div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700 text-sm font-semibold"><span>🔒</span><span>{currentYear} records are frozen (audit approved). No edits permitted.</span></div>}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard label="💰 Carry Forward" value={"₹"+carryForward.toLocaleString()} bg={carryForward>=0?"bg-teal-50":"bg-red-50"} borderColor={carryForward>=0?"border-teal-500":"border-red-500"}/>
          <MetricCard label="📥 Collected" value={"₹"+metrics.collected.toLocaleString()} sub={MONTHS[currentMonth]+" "+currentYear} bg="bg-emerald-50" borderColor="border-emerald-500"/>
          <MetricCard label="📤 Expenses" value={"₹"+metrics.expenses.toLocaleString()} bg="bg-orange-50" borderColor="border-orange-400"/>
          <MetricCard label="📊 Net" value={"₹"+metrics.balance.toLocaleString()} bg={metrics.balance>=0?"bg-blue-50":"bg-red-50"} borderColor={metrics.balance>=0?"border-blue-500":"border-red-500"}/>
          <div onClick={()=>setView("pendingCollections")} className="bg-red-50 rounded-lg p-4 border-l-4 border-red-500 shadow cursor-pointer hover:shadow-md transition"><p className="text-gray-500 text-xs">⏳ Pending</p><p className="text-xl font-bold text-red-600">₹{(pendingMetrics.totalOverdue+pendingMetrics.totalCurrent).toLocaleString()}</p><p className="text-xs text-blue-500 mt-1 font-semibold">View →</p></div>
        </div>

        {/* Escalation summary — only show to admin when flags exist */}
        {isAdmin&&Object.keys(escalationMap).length>0&&(
          <EscalationPanel
            escalationMap={escalationMap}
            data={data}
            FLATS={FLATS}
            config={escConfig}
            running={escRunning}
            lastRun={escLastRun}
            isAdmin={isAdmin}
            onRunEscalation={()=>{
              runEscalation(escalationSendWA, null, data?.building?.name)
            }}
          />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Collection vs Expense Trend */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-bold mb-1">📈 Collection vs Expense — {currentYear}</h3>
            <p className="text-xs text-gray-400 mb-3">{currentYear===TODAY.getFullYear()?"Jan – "+MONTHS[TODAY.getMonth()]+" (actuals only)":"Full Year"}</p>
            {trendData().length===0
              ?<p className="text-gray-400 text-sm text-center py-10">No data for future year</p>
              :<ResponsiveContainer width="100%" height={200}><LineChart data={trendData()}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip formatter={v=>"₹"+v.toLocaleString()}/><Legend/><Line type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} name="Collected"/><Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} name="Expenses"/></LineChart></ResponsiveContainer>}
          </div>
          {/* Chart 2: Top Outstanding Flats */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-bold mb-1">⚠️ Top Pending Flats</h3>
            <p className="text-xs text-gray-400 mb-3">Flats with the highest outstanding dues (all time)</p>
            {topPendingFlats().length===0
              ?<p className="text-gray-400 text-sm text-center py-10">🎉 All flats are clear!</p>
              :<ResponsiveContainer width="100%" height={200}><BarChart data={topPendingFlats()} layout="vertical" margin={{left:10,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>"₹"+v.toLocaleString()}/><YAxis type="category" dataKey="flat" tick={{fontSize:11}} width={60}/><Tooltip formatter={v=>"₹"+v.toLocaleString()} labelFormatter={(_,payload)=>payload?.[0]?.payload?.name||""}/><Bar dataKey="pending" fill="#ef4444" radius={[0,3,3,0]} name="Pending"/></BarChart></ResponsiveContainer>}
          </div>
          {/* Chart 3: Yearly Expense Breakdown — dynamic pie + legend table */}
          <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
            <h3 className="font-bold mb-1">🥧 Expense Categories — {currentYear}</h3>
            <p className="text-xs text-gray-400 mb-4">Full-year expense split by category</p>
            {yearlyExpBreakdown().length===0
              ?<p className="text-gray-400 text-sm text-center py-10">No expenses recorded for {currentYear}</p>
              :<div className="flex flex-col md:flex-row gap-4 items-start">
                <div className="flex-shrink-0 w-full md:w-48">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart><Pie data={yearlyExpBreakdown()} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {yearlyExpBreakdown().map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Pie><Tooltip formatter={v=>"₹"+v.toLocaleString()}/></PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 overflow-y-auto" style={{maxHeight:"200px"}}>
                  {(()=>{const d=yearlyExpBreakdown();const total=d.reduce((s,x)=>s+x.value,0);return d.sort((a,b)=>b.value-a.value).map((item,i)=>(
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:COLORS[i%COLORS.length]}}></div>
                        <span className="text-xs text-gray-700 truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-xs font-bold text-gray-800">₹{item.value.toLocaleString()}</span>
                        <span className="text-xs text-gray-400 w-8 text-right">{Math.round(item.value/total*100)}%</span>
                      </div>
                    </div>
                  ))})()}
                </div>
              </div>}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-5 border-b flex justify-between items-center"><h3 className="font-bold">Collections — {MONTHS[currentMonth]} {currentYear}</h3><button onClick={()=>setView("special")} className="text-xs text-purple-600 font-semibold hover:underline">🎯 Special Collections →</button></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Flat</th><th className="px-4 py-3 text-left">Owner</th><th className="px-4 py-3 text-left">Occupant</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-center">Amount</th><th className="px-4 py-3 text-center">Payment</th><th className="px-4 py-3 text-center">Outstanding</th></tr></thead>
          <tbody>{FLATS.map(flat=>{const c=gc(flat,currentYear,currentMonth);const st=getFlatStatus(flat);const f=data.flats[flat];const p=getFlatPending(flat);const tot=p.overdue+p.current;return(<tr key={flat} className="border-t hover:bg-gray-50"><td className="px-4 py-3 font-bold text-blue-600 cursor-pointer hover:underline" onClick={()=>{setSelectedFlat(flat);setAddingTenant(false);setView("flatDetail");}}>{flat}</td><td className="px-4 py-3 text-gray-700 text-xs">{f.ownerName||"—"}</td><td className="px-4 py-3">{st==="owner"&&<span className="text-blue-600 font-semibold text-xs">{f.ownerName}</span>}{st==="tenant"&&<span className="text-green-600 text-xs">{f.currentTenant.name}</span>}{st==="vacant"&&<span className="text-red-400 text-xs">—</span>}</td><td className="px-4 py-3"><StatusBadge status={st}/></td><td className="px-4 py-3 text-center font-semibold">₹{c.amount}</td><td className="px-4 py-3 text-center"><button onClick={()=>requestToggle(flat,currentYear,currentMonth)} disabled={!isAdmin} className={"px-3 py-1 rounded text-xs font-bold "+cellClass(c,currentYear,currentMonth)+(isAdmin?" cursor-pointer hover:opacity-80":" cursor-default")}>{c.paid?(c.advance?"ADV":"✓ Paid"):"✗ Pending"}</button></td><td className="px-4 py-3 text-center">{tot>0?isAdmin?<button onClick={()=>openRecordPmt(flat)} className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold hover:bg-orange-200">₹{tot.toLocaleString()}</button>:<span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold">₹{tot.toLocaleString()}</span>:p.credit>0?<span className="px-2 py-1 bg-purple-100 text-purple-600 rounded text-xs font-bold">ADV ₹{p.credit.toLocaleString()}</span>:<span className="text-green-500 text-xs font-bold">✓ Clear</span>}</td></tr>);})}</tbody></table></div>
        </div>
      </main>
      {/* Managing Committee — bottom horizontal scroll strip */}
      <CommitteeBanner members={data.managingCommittee||[]} isAdmin={isAdmin} onUpdate={updateCommittee}/>
      {/* New notice blinking alert */}
      <NewNoticeAlert data={data}/>
      {/* Confirmation modal for payment toggle */}
      {confirmPmt&&confirmPmtInfo&&(
        <ConfirmModal
          title={confirmPmtInfo.cur.paid?"Mark as Pending?":"Mark as Paid?"}
          message={`Flat ${confirmPmtInfo.flatId} — ${confirmPmtInfo.monthLabel}`}
          subMessage={confirmPmtInfo.cur.paid?"This will revert the payment status to pending.":"This will mark the maintenance as received."}
          confirmLabel={confirmPmtInfo.cur.paid?"Yes, Mark Pending":"Yes, Mark Paid"}
          confirmClass={confirmPmtInfo.cur.paid?"bg-orange-500 hover:bg-orange-600":"bg-emerald-600 hover:bg-emerald-700"}
          onConfirm={confirmToggle}
          onCancel={()=>setConfirmPmt(null)}
        />
      )}
    </div>
  );
}
