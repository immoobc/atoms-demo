import { useState } from 'react';
import { AlertCircle, Check, ChevronDown, Eye, FileCode2, Loader2, Wrench, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AGENT_AVATARS, formatTime } from '@/lib/memchat';
import { STAGE_STEPS, activeStep, type Run } from '@/lib/projects';
import MemoryEvents from '@/components/chat/MemoryEvents';

function Stepper({ run }: { run: Run }) {
  const current = activeStep(run);
  return (
    <ol className="flex items-center gap-1.5">
      {STAGE_STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current && run.status === 'running';
        const failed = i === current && run.status === 'failed';
        const fixing = active && i === 1 && run.stage === 'fix';
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                done && 'border-[#0B0B0F] bg-[#0B0B0F] text-white',
                active && 'border-[#7C5CFF] bg-[#F5F2FF] text-[#7C5CFF]',
                failed && 'border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]',
                !done && !active && !failed && 'border-[#E7E7EA] text-[#9A9AA5]',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : failed ? <X className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={cn('block truncate text-[12px] font-medium', !done && !active && 'text-[#9A9AA5]')}>{s.label}</span>
              <span className="block truncate text-[10px] text-[#9A9AA5]">{fixing ? '自测未通过，自动修复中' : s.sub}</span>
            </span>
            {i < STAGE_STEPS.length - 1 && <span className={cn('h-px w-3 shrink-0', done ? 'bg-[#0B0B0F]' : 'bg-[#E7E7EA]')} />}
          </li>
        );
      })}
    </ol>
  );
}

function RoleHeader({ avatar, name, model, extra }: { avatar: string; name: string; model: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <img src={avatar} alt="" className="h-6 w-6 rounded-full bg-[#F2F2F4] object-cover" />
      <span className="text-[13px] font-semibold">{name}</span>
      <span className="font-mono text-[10px] text-[#9A9AA5]">{model}</span>
      <span className="flex-1" />
      {extra}
    </div>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[13px] text-[#9A9AA5]">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {text}
    </div>
  );
}

interface Props {
  run: Run;
  selected: boolean;
  onPreview: () => void;
}

export default function PipelineRun({ run, selected, onPreview }: Props) {
  const [showLead, setShowLead] = useState(true);
  const lead = run.lead_output;
  const dev = run.dev_output;
  const step = activeStep(run);
  const fileCount = Object.keys(run.files || {}).length;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[88%] whitespace-pre-wrap rounded-[18px] rounded-br-md bg-[#F2F2F4] px-4 py-2.5 text-[14px] leading-6">{run.prompt}</div>
      </div>

      <article className={cn('rounded-[16px] border bg-white p-3.5 transition-shadow', selected ? 'border-[#CFC3FF] shadow-[0_0_0_3px_#F2EEFF]' : 'border-[#E7E7EA]')}>
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-md bg-[#0B0B0F] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">v{run.version}</span>
          <span className="text-[11px] text-[#9A9AA5]">{formatTime(run.create_time)}</span>
          <span className="flex-1" />
          {run.status === 'done' && fileCount > 0 && (
            <button onClick={onPreview} className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[#5B3FD9] hover:bg-[#F5F2FF]">
              <Eye className="h-3.5 w-3.5" /> 预览此版本
            </button>
          )}
        </div>
        <Stepper run={run} />

        <div className="mt-3 space-y-3 border-t border-[#F2F2F4] pt-3">
          <section>
            <RoleHeader
              avatar={AGENT_AVATARS[0]}
              name="项目主管"
              model="deepseek-v4-pro"
              extra={
                lead && (
                  <button aria-label="展开或收起方案" onClick={() => setShowLead(!showLead)} className="icon-btn h-6 w-6">
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !showLead && '-rotate-90')} />
                  </button>
                )
              }
            />
            <div className="mt-1.5 pl-8">
              {!lead && step === 0 && run.status === 'running' && <Waiting text="正在拆解目标、制定方案…" />}
              {lead && (
                <>
                  <p className="text-[13px] leading-5 text-[#2A2A33]">{lead.summary}</p>
                  {showLead && (
                    <div className="mt-2 space-y-2.5 text-[12.5px] leading-5">
                      <div>
                        <h5 className="mb-1 font-semibold text-[#5B5B66]">任务拆解</h5>
                        <ol className="space-y-1">
                          {lead.tasks.map((t) => (
                            <li key={t.id} className="flex gap-1.5">
                              <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#F2F2F4] text-[10px] font-semibold">{t.id}</span>
                              <span><span className="font-medium">{t.title}</span>{t.detail && <span className="text-[#5B5B66]"> — {t.detail}</span>}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <h5 className="mb-1 font-semibold text-[#5B5B66]">验收要点</h5>
                        <ul className="space-y-0.5">
                          {lead.acceptance_points.map((p) => (
                            <li key={p} className="text-[#2A2A33]">· {p}</li>
                          ))}
                        </ul>
                      </div>
                      {lead.deliverables.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {lead.deliverables.map((d) => (
                            <span key={d} className="rounded-md bg-[#F7F7F8] px-1.5 py-0.5 text-[11px] text-[#5B5B66] ring-1 ring-[#E7E7EA]">{d}</span>
                          ))}
                        </div>
                      )}
                      {lead.risks.length > 0 && <p className="text-[11.5px] text-[#9A9AA5]">风险：{lead.risks.join('；')}</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {(lead || dev) && (
            <section>
              <RoleHeader
                avatar={AGENT_AVATARS[3]}
                name="开发工程师"
                model="deepseek-v4-pro"
                extra={
                  dev && (
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        dev.self_check.passed ? 'bg-[#EFFAF3] text-[#15803D]' : 'bg-[#FFF8EB] text-[#B45309]',
                      )}
                    >
                      {dev.self_check.passed ? '自测通过' : '自测未通过'}
                    </span>
                  )
                }
              />
              <div className="mt-1.5 pl-8">
                {!dev && run.status === 'running' && (
                  <Waiting text={run.stage === 'fix' ? '自测发现问题，正在自动修复一轮…' : '正在按方案编写代码并自测（约 1–3 分钟）…'} />
                )}
                {dev && (
                  <div className="space-y-2.5 text-[12.5px] leading-5">
                    {dev.delivery_log.length > 0 && (
                      <div>
                        <h5 className="mb-1 font-semibold text-[#5B5B66]">交付记录</h5>
                        <ul className="space-y-0.5">
                          {dev.delivery_log.map((d) => (
                            <li key={d}>· {d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <h5 className="mb-1 font-semibold text-[#5B5B66]">自测报告</h5>
                      <ul className="space-y-1">
                        {dev.self_check.items.map((it) => (
                          <li key={it.point} className="flex gap-1.5">
                            {it.passed ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16A34A]" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#DC2626]" />}
                            <span>
                              {it.point}
                              {it.evidence && <span className="block text-[11.5px] text-[#9A9AA5]">{it.evidence}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {dev.self_check.notes && <p className="mt-1 text-[11.5px] text-[#9A9AA5]">{dev.self_check.notes}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#5B5B66]">
                      <FileCode2 className="h-3.5 w-3.5" />
                      {Object.keys(run.files).sort().map((f) => (
                        <span key={f} className="rounded bg-[#F7F7F8] px-1.5 py-0.5 font-mono ring-1 ring-[#E7E7EA]">{f}</span>
                      ))}
                      {dev.fix_round > 0 && (
                        <span className="flex items-center gap-1 rounded bg-[#FFF8EB] px-1.5 py-0.5 text-[#B45309]">
                          <Wrench className="h-3 w-3" /> 已自动修复 1 轮
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {run.status === 'running' && run.stage === 'memory' && <Waiting text="正在把项目结论沉淀为长期记忆…" />}
          {run.memory_events && (
            <MemoryEvents msg={{ id: `run-${run.id}`, role: 'assistant', content: '', events: run.memory_events, status: 'done' }} />
          )}
          {run.status === 'failed' && (
            <div className="flex items-start gap-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#B91C1C]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>流水线执行失败：{run.error || '未知错误'}。可以修改需求后重新发起。</span>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
