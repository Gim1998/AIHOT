import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/research";
import { PAYMENT_KINDS, RESEARCH_STATUS, RESEARCH_VERDICTS, type ResearchNote, type ResearchNotebook } from "@aihot/contracts/research";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { AdminPage, Card, Field, Input, Textarea, Select, Button } from "../../features/admin/ui";

export const meta = () => [{title:"需求验证 · MyHOT"}];
export async function loader({request}: Route.LoaderArgs) {
  return adminGet<ResearchNotebook>(request,`/api/admin/research${new URL(request.url).search}`);
}
export const headers = () => ({"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow"});
const empty = {title:"",status:"inbox",verdict:"unrated",notes:"",evidenceKind:"unknown",evidence:"",sourceUrl:"",sourceDate:"",experiment:"",result:"",acquisition:"",pricing:"",version:0,updatedAt:""} as const;

function Editor({data}: {data:ResearchNotebook}) {
  const [form,setForm] = useState<ResearchNote>(()=>data.selected ?? {...empty,id:data.article?`article-${data.article.id}`:`manual-${crypto.randomUUID()}`,articleId:data.article?.id??null,title:data.article?.title??"",sourceUrl:data.article?.url??""});
  const {run,busy} = useAdminAction();
  const navigate = useNavigate();
  function update(key: keyof ResearchNote,value:string) { setForm(f=>({...f,[key]:value})); }
  const save = async () => {
    const {id,updatedAt,...input}=form;
    const result=await run<ResearchNote>("PUT",`/api/admin/research/${encodeURIComponent(id)}`,input,{success:"私人验证记录已保存",revalidate:false});
    if(result){setForm(result);navigate(`/admin/research?note=${encodeURIComponent(id)}`);}
  };
  return <Card title={form.articleId?"这条需求的验证记录":"手动记录一条线索"}>
    <form onSubmit={e=>{e.preventDefault();void save();}} className="space-y-4">
      {form.articleId && <Link className="text-[13px] text-accent" to={`/items/${form.articleId}`}>查看公开内容 ↗</Link>}
      <Field label="标题"><Input required maxLength={240} value={form.title} onChange={e=>update("title",e.target.value)}/></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="我的进度"><Select value={form.status} onChange={e=>update("status",e.target.value)}>{Object.entries(RESEARCH_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="我的判断（用于后续校准）"><Select value={form.verdict} onChange={e=>update("verdict",e.target.value)}>{Object.entries(RESEARCH_VERDICTS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></Field>
      </div>
      <Field label="购买理由、现有方案与缺口"><Textarea maxLength={4000} value={form.notes} onChange={e=>update("notes",e.target.value)} placeholder="谁遇到了什么问题？现在怎么做？仍然卡在哪里？"/></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="证据原文链接"><Input type="url" maxLength={2000} value={form.sourceUrl} onChange={e=>update("sourceUrl",e.target.value)} placeholder="https://…"/></Field>
        <Field label="证据日期"><Input type="date" value={form.sourceDate} onChange={e=>update("sourceDate",e.target.value)}/></Field>
      </div>
      <Field label="付款证据的性质"><Select value={form.evidenceKind} onChange={e=>update("evidenceKind",e.target.value)}>{Object.entries(PAYMENT_KINDS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="证据原文、金额与背景" hint="可以记录订单、招聘预算、差评或访谈原话；明确是谁为哪一步付了钱。"><Textarea maxLength={4000} value={form.evidence} onChange={e=>update("evidence",e.target.value)}/></Field>
      <Field label="准备验证什么"><Textarea maxLength={4000} value={form.experiment} onChange={e=>update("experiment",e.target.value)} placeholder="样本、最小交付、需要人工确认的步骤，以及成功或停止的条件"/></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="第一批用户在哪里"><Textarea maxLength={4000} value={form.acquisition} onChange={e=>update("acquisition",e.target.value)}/></Field>
        <Field label="收费方式与待验证价格"><Textarea maxLength={4000} value={form.pricing} onChange={e=>update("pricing",e.target.value)}/></Field>
      </div>
      <Field label="实际验证结果与判断理由"><Textarea maxLength={4000} value={form.result} onChange={e=>update("result",e.target.value)} placeholder="记录真实使用、拒绝、付款及原因；口头认可和实际付款分开。"/></Field>
      <Button type="submit" tone="primary" busy={busy}>保存私人记录</Button>
    </form>
  </Card>;
}

export default function Research({loaderData:data}: Route.ComponentProps) {
  const exportPage=()=>{
    const blob=new Blob([JSON.stringify(data.rows,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`myhot-research-page-${data.page}.json`;a.click();URL.revokeObjectURL(url);
  };
  return <AdminPage title="需求验证" subtitle="私人记录保存在云端，仅管理员可见。保存不会发布内容、联系他人或调用模型。" actions={<Link className="text-[13px] text-accent" to="/admin/research?new=1">＋手动记录线索</Link>}>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Editor key={`${data.selected?.id??data.article?.id??"new"}-${data.selected?.version??0}`} data={data}/>
      <div className="space-y-5">
        <Card title={`我的记录 · ${data.total}`} right={<button onClick={exportPage} className="hover:text-accent">导出本页</button>}>
          {data.rows.length?<ul className="space-y-4">{data.rows.map(n=><li key={n.id}><Link className="text-[14px] font-medium hover:text-accent" to={`/admin/research?note=${encodeURIComponent(n.id)}`}>{n.title}</Link><p className="mt-1 text-[12px] text-ink-3">{RESEARCH_STATUS[n.status]} · {RESEARCH_VERDICTS[n.verdict]}</p></li>)}</ul>:<p className="text-[13px] text-ink-3">从内容详情进入，或直接录入手动线索。</p>}
          <div className="mt-4 flex justify-between text-[13px] text-accent">{data.page>1?<Link to={`/admin/research?page=${data.page-1}`}>上一页</Link>:<span/>}{data.page*30<data.total&&<Link to={`/admin/research?page=${data.page+1}`}>下一页</Link>}</div>
        </Card>
        <Card title="评分校准样本">
          <p className="mb-3 text-[12px] leading-relaxed text-ink-3">将实际结果与当前评分比较。样本由你标注；保存判断不会自动改变评分权重。</p>
          {data.calibration.map(c=><p key={c.verdict} className="mb-2 text-[13px]">{RESEARCH_VERDICTS[c.verdict as keyof typeof RESEARCH_VERDICTS]}：{c.count} 条 · 当前均分 {c.averageScore??"暂无"}</p>)}
        </Card>
      </div>
    </div>
  </AdminPage>;
}
