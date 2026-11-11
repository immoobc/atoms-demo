import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { ProjectInput } from '@/lib/projects';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: ProjectInput;
  submitLabel: string;
  onSubmit: (data: ProjectInput) => Promise<void>;
}

const EMPTY: ProjectInput = { name: '', goal: '', background: '', acceptance: '' };

const FIELDS: { key: keyof ProjectInput; label: string; placeholder: string; rows?: number }[] = [
  { key: 'name', label: '项目名称', placeholder: '例如：番茄专注计时器' },
  { key: 'goal', label: '项目目标', placeholder: '要做成什么样的产品、解决什么问题', rows: 2 },
  { key: 'background', label: '项目背景', placeholder: '目标用户、使用场景、约束条件', rows: 2 },
  { key: 'acceptance', label: '验收标准', placeholder: '怎样算完成，例如：可以添加任务、计时结束有提醒', rows: 3 },
];

export default function ProjectFormDialog({ open, onOpenChange, title, initial, submitLabel, onSubmit }: Props) {
  const [data, setData] = useState<ProjectInput>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setData(initial ?? EMPTY);
  }, [open, initial]);

  const submit = async () => {
    if (!data.name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(data);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>项目信息会作为项目主管和开发工程师的标准输入。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs font-medium text-[#5B5B66]">
                {f.label}
                {f.key === 'name' && <span className="text-[#DC2626]"> *</span>}
              </span>
              {f.rows ? (
                <Textarea
                  rows={f.rows}
                  value={data[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                />
              ) : (
                <Input value={data[f.key]} maxLength={80} placeholder={f.placeholder} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} />
              )}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={!data.name.trim() || saving} onClick={submit} className="bg-[#0B0B0F] text-white hover:bg-[#2A2A33]">
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
