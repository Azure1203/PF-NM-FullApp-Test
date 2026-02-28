import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Editor from "@monaco-editor/react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, Trash2, Search, Code, ChevronRight } from "lucide-react";
import type { ProxyVariable } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const proxyVariableSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["pricing", "export"]),
  formula: z.string().min(1, "Formula is required"),
});

type ProxyVariableValues = z.infer<typeof proxyVariableSchema>;

export default function ProxyVariableManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const form = useForm<ProxyVariableValues>({
    resolver: zodResolver(proxyVariableSchema),
    defaultValues: {
      name: "",
      type: "pricing",
      formula: "// Enter your formula here\n",
    },
  });

  const { data: variables, isLoading } = useQuery<ProxyVariable[]>({
    queryKey: ["/api/admin/proxy-variables"],
  });

  const filteredVariables = useMemo(() => {
    if (!variables) return [];
    return variables.filter(v => 
      v.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [variables, search]);

  const saveMutation = useMutation({
    mutationFn: async (values: ProxyVariableValues) => {
      const res = await apiRequest("POST", "/api/admin/proxy-variables", values);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy-variables"] });
      toast({ title: "Success", description: "Proxy variable saved" });
      if (!editingId) {
        setEditingId(data.id);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/proxy-variables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy-variables"] });
      toast({ title: "Deleted", description: "Proxy variable removed" });
      setEditingId(null);
      form.reset({
        name: "",
        type: "pricing",
        formula: "// Enter your formula here\n",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (values: ProxyVariableValues) => {
    saveMutation.mutate(values);
  };

  const handleEdit = (v: ProxyVariable) => {
    setEditingId(v.id);
    form.reset({
      name: v.name,
      type: v.type as "pricing" | "export",
      formula: v.formula,
    });
  };

  const handleNew = () => {
    setEditingId(null);
    form.reset({
      name: "",
      type: "pricing",
      formula: "// Enter your formula here\n",
    });
  };

  return (
    <div className="h-[calc(100vh-120px)] border rounded-lg bg-card overflow-hidden">
      <ResizablePanelGroup direction="horizontal">
        {/* Left Pane: List View */}
        <ResizablePanel defaultSize={30} minSize={20}>
          <div className="h-full flex flex-col border-r">
            <div className="p-4 space-y-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  Variables
                </h2>
                <Button size="icon" variant="ghost" onClick={handleNew} title="New Variable">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search variables..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {isLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredVariables.length === 0 ? (
                  <div className="text-center p-8 text-muted-foreground text-sm">
                    No variables found
                  </div>
                ) : (
                  filteredVariables.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => handleEdit(v)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left group",
                        editingId === v.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent text-foreground"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{v.name}</span>
                          <Badge 
                            variant={editingId === v.id ? "outline" : "secondary"}
                            className={cn(
                              "text-[10px] uppercase px-1 py-0 h-4",
                              editingId === v.id && "border-primary-foreground/20 text-primary-foreground"
                            )}
                          >
                            {v.type}
                          </Badge>
                        </div>
                      </div>
                      <ChevronRight className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        editingId === v.id ? "translate-x-0" : "-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                      )} />
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Pane: Editor View */}
        <ResizablePanel defaultSize={70}>
          <div className="h-full flex flex-col">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
                <div className="p-4 border-b bg-muted/30">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-xs uppercase text-muted-foreground font-bold">Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="variable.name" className="h-8 bg-background" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-xs uppercase text-muted-foreground font-bold">Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-8 bg-background">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pricing">Pricing</SelectItem>
                              <SelectItem value="export">Export</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="flex-1 relative min-h-0 bg-[#1e1e1e]">
                  <FormField
                    control={form.control}
                    name="formula"
                    render={({ field }) => (
                      <div className="absolute inset-0">
                        <Editor
                          height="100%"
                          language="javascript"
                          theme="vs-dark"
                          value={field.value}
                          onChange={(val) => field.onChange(val || "")}
                          options={{
                            minimap: { enabled: false },
                            formatOnPaste: true,
                            bracketPairColorization: { enabled: true },
                            lineNumbers: "on",
                            fontSize: 14,
                            padding: { top: 10 },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                          }}
                        />
                      </div>
                    )}
                  />
                </div>

                <div className="p-4 border-t flex justify-between bg-muted/30">
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {editingId ? "Save Changes" : "Create Variable"}
                    </Button>
                  </div>
                  {editingId && (
                    <Button 
                      type="button" 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this variable?")) {
                          deleteMutation.mutate(editingId);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
