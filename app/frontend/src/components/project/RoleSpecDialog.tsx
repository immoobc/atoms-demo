import { useEffect, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AGENT_AVATARS } from '@/lib/memchat';
import { errMsg, projApi, type RoleField, type RoleSpec } from '@/lib/projects';

const AVATAR: Record<string, string> = { lead: AGENT_AVATARS[0], dev: AGENT_AVATARS[3] };

function FieldTable({ title, fields }: { title: string; fields: RoleField[] }) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold text-[#5B5B66]">{title}</h4>
      <div className="overflow-hidden rounded-[10px] border border-[#E7E7EA]">
        <table className="w-full text-left text-[12px]">
          <tbody className="divide-y divide-[#F2F2F4]">
            {fields.map((f) => (
              <tr key={f.field}>
                <td className="whitespace-nowrap bg-[#FAFAFB] px-2.5 py-1.5 font-mono text-[11px] text-[#0B0B0F]">{f.field}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-[#7C5CFF]">{f.type}</td>
                <td className="px-2 py-1.5 text-[#5B5B66]">{f.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RoleSpecDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [specs, setSpecs] = useState<RoleSpec[]>([]);

  useEffect(() => {
    if (!open || specs.length) return;
    projApi
      .roleSpecs()
      .then((r) => setSpecs(r.items))
      .catch((e) => toast.error('加载角色规范失败', { description: errMsg(e) }));
  }, [open, specs.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>角色标准输入 / 输出规则</DialogTitle>
          <DialogDescription>每个角色只接收约定的输入，并输出经过后端校验的结构化 JSON；校验失败会自动修复一次。</DialogDescription>
        </DialogHeader>
        {!specs.length ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#9A9AA5]" /></div>
        ) : (
          <div className="grid items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
            {specs.map((s, i) => (
              <div key={s.key} className="contents">
                {i > 0 && <ArrowRight className="mx-auto hidden h-5 w-5 self-center text-[#9A9AA5] md:block" />}
                <section className="space-y-3 rounded-[14px] border border-[#E7E7EA] p-4">
                  <div className="flex items-center gap-2.5">
                    <img src={AVATAR[s.key]} alt="" className="h-9 w-9 rounded-full bg-[#F2F2F4] object-cover" />
                    <div>
                      <h3 className="text-sm font-semibold">{s.name}</h3>
                      <p className="font-mono text-[11px] text-[#9A9AA5]">{s.model}</p>
                    </div>
                  </div>
                  <p className="text-[13px] leading-5 text-[#2A2A33]">{s.purpose}</p>
                  <FieldTable title="标准输入" fields={s.input} />
                  <FieldTable title="标准输出" fields={s.output} />
                </section>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
