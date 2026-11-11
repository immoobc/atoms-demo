import { forwardRef, useMemo, useState } from "react";
import {
  Search, LayoutGrid, List, Star, MoreHorizontal, Pencil, Copy, Trash2, Globe, FolderOpen, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TEMPLATES, formatRelative, type Project, type Template } from "./data";
import { cn } from "@/lib/utils";

export type ProjectTab = "recent" | "mine" | "starred" | "templates";

interface Props {
  tab: ProjectTab;
  onTabChange: (t: ProjectTab) => void;
  projects: Project[];
  setProjects: (updater: (p: Project[]) => Project[]) => void;
  onUseTemplate: (t: Template) => void;
}

function Thumb({ p, className }: { p: { name: string; gradient: string; thumb?: string }; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br", p.gradient, className)}>
      {p.thumb ? (
        <img src={p.thumb} alt={p.name} className="h-full w-full object-cover object-top" loading="lazy" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-[#0B0B0F]/25">
          {p.name.slice(0, 2)}
        </span>
      )}
    </div>
  );
}

const ProjectsSection = forwardRef<HTMLInputElement, Props>(function ProjectsSection(
  { tab, onTabChange, projects, setProjects, onUseTemplate },
  searchRef,
) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<Project | null>(null);

  const visible = useMemo(() => {
    let list = projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
    if (tab === "starred") list = list.filter((p) => p.starred);
    list = [...list].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "zh") : b.updatedAt - a.updatedAt));
    return tab === "recent" ? list.slice(0, 8) : list;
  }, [projects, query, sort, tab]);

  const templates = TEMPLATES.filter((t) => t.name.includes(query));

  const toggleStar = (id: string) =>
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p)));

  const duplicate = (p: Project) => {
    setProjects((ps) => [{ ...p, id: crypto.randomUUID(), name: `${p.name} 副本`, updatedAt: Date.now(), published: false, starred: false }, ...ps]);
    toast.success(`已复制「${p.name}」`);
  };

  const ProjectMenu = ({ p }: { p: Project }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="更多操作" className="icon-btn bg-white/90" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => { setRenaming(p); setNewName(p.name); }}>
          <Pencil className="mr-2 h-4 w-4" />重命名
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => duplicate(p)}><Copy className="mr-2 h-4 w-4" />创建副本</DropdownMenuItem>
        <DropdownMenuItem onClick={() => toast(`在新标签页打开「${p.name}」（演示）`)}>
          <ExternalLink className="mr-2 h-4 w-4" />在新标签页打开
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-[#DC2626]" onClick={() => setDeleting(p)}>
          <Trash2 className="mr-2 h-4 w-4" />删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const StarBtn = ({ p }: { p: Project }) => (
    <button
      aria-label={p.starred ? "取消收藏" : "收藏"}
      onClick={(e) => { e.stopPropagation(); toggleStar(p.id); }}
      className="icon-btn bg-white/90"
    >
      <Star className={cn("h-4 w-4", p.starred && "fill-[#F5B301] text-[#F5B301]")} />
    </button>
  );

  const open = (p: Project) => toast(`正在打开「${p.name}」…`);

  return (
    <section className="mt-14 pb-16">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as ProjectTab)}>
          <TabsList className="h-10 rounded-[10px] bg-[#F2F2F4] p-1">
            {[
              ["recent", "最近项目"], ["mine", "我的项目"], ["starred", "已收藏"], ["templates", "模板"],
            ].map(([v, l]) => (
              <TabsTrigger key={v} value={v} className="rounded-lg px-3.5 text-[13px] data-[state=active]:shadow-sm">
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-56 md:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9AA5]" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "templates" ? "搜索模板" : "搜索项目"}
              className="h-9 rounded-[10px] border-[#E7E7EA] pl-9 text-sm"
            />
          </div>
          {tab !== "templates" && (
            <>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-9 w-[120px] rounded-[10px] border-[#E7E7EA] text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated">最近更新</SelectItem>
                  <SelectItem value="name">按名称</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex rounded-[10px] border border-[#E7E7EA] p-0.5">
                {(["grid", "list"] as const).map((v) => {
                  const Icon = v === "grid" ? LayoutGrid : List;
                  return (
                    <button
                      key={v}
                      aria-label={v === "grid" ? "网格视图" : "列表视图"}
                      onClick={() => setView(v)}
                      className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === v ? "bg-[#F2F2F4] text-[#0B0B0F]" : "text-[#9A9AA5]")}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {tab === "templates" ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <article key={t.id} className="card group">
              <Thumb p={t} className="aspect-[16/10] rounded-[10px]" />
              <div className="mt-3 flex items-center justify-between px-1">
                <div>
                  <h3 className="text-sm font-semibold">{t.name}</h3>
                  <p className="text-xs text-[#9A9AA5]">{t.category}</p>
                </div>
                <Button size="sm" onClick={() => onUseTemplate(t)} className="h-8 rounded-lg bg-[#0B0B0F] text-white hover:bg-[#2A2A33]">
                  使用模板
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#E7E7EA] py-16 text-center">
          <FolderOpen className="h-8 w-8 text-[#9A9AA5]" />
          <p className="mt-3 text-sm text-[#5B5B66]">{query ? "没有匹配的项目" : tab === "starred" ? "还没有收藏的项目" : "还没有项目，在上方输入想法开始创建"}</p>
        </div>
      ) : view === "grid" ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => (
            <article key={p.id} onClick={() => open(p)} className="card group cursor-pointer">
              <div className="relative">
                <Thumb p={p} className="aspect-[16/10] rounded-[10px] border border-[#F2F2F4]" />
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 data-[starred=true]:opacity-100">
                  <StarBtn p={p} />
                  <ProjectMenu p={p} />
                </div>
                {p.published && (
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-[#16A34A]">
                    <Globe className="h-3 w-3" />已发布
                  </span>
                )}
              </div>
              <div className="mt-3 px-1">
                <h3 className="truncate text-sm font-semibold">{p.name}</h3>
                <p className="mt-0.5 text-xs text-[#9A9AA5]">编辑于 {formatRelative(p.updatedAt)}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-6 divide-y divide-[#F2F2F4] rounded-[14px] border border-[#E7E7EA]">
          {visible.map((p) => (
            <div key={p.id} onClick={() => open(p)} className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-[#F7F7F8]">
              <Thumb p={p} className="h-10 w-16 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold">{p.name}</h3>
                <p className="text-xs text-[#9A9AA5]">编辑于 {formatRelative(p.updatedAt)}</p>
              </div>
              <span className={cn("hidden text-xs sm:block", p.published ? "text-[#16A34A]" : "text-[#9A9AA5]")}>
                {p.published ? "已发布" : "草稿"}
              </span>
              <StarBtn p={p} />
              <ProjectMenu p={p} />
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>重命名项目</DialogTitle></DialogHeader>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>取消</Button>
            <Button
              disabled={!newName.trim()}
              className="bg-[#0B0B0F] text-white hover:bg-[#2A2A33]"
              onClick={() => {
                const target = renaming;
                if (!target) return;
                setProjects((ps) => ps.map((p) => (p.id === target.id ? { ...p, name: newName.trim(), updatedAt: Date.now() } : p)));
                setRenaming(null);
                toast.success("已重命名");
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>删除「{deleting?.name}」？</DialogTitle></DialogHeader>
          <p className="text-sm text-[#5B5B66]">删除后无法恢复，项目的所有版本与部署将一并移除。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>取消</Button>
            <Button
              className="bg-[#DC2626] text-white hover:bg-[#B91C1C]"
              onClick={() => {
                const target = deleting;
                if (!target) return;
                setProjects((ps) => ps.filter((p) => p.id !== target.id));
                setDeleting(null);
                toast.success("项目已删除");
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
});

export default ProjectsSection;
