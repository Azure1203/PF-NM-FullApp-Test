import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Editor from "@monaco-editor/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save } from "lucide-react";
import type { ProxyVariable } from "@shared/schema";

const proxyVariableSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["pricing", "export"]),
  formula: z.string().min(1, "Formula is required"),
});

type ProxyVariableValues = z.infer<typeof proxyVariableSchema>;

export default function ProxyVariableManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<ProxyVariableValues>({
    resolver: zodResolver(proxyVariableSchema),
    defaultValues: {
      name: "",
      type: "pricing",
      formula: "// Enter your mathjs formula here\n",
    },
  });

  const { data: variables, isLoading } = useQuery<ProxyVariable[]>({
    queryKey: ["/api/admin/proxy-variables"],
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ProxyVariableValues) => {
      const res = await apiRequest("POST", "/api/admin/proxy-variables", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy-variables"] });
      toast({ title: "Success", description: "Proxy variable saved" });
      form.reset();
      setEditingId(null);
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

  return (
    <div className="container mx-auto py-10 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit" : "Create"} Proxy Variable</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Variable Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="proxyvar.name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
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

              <FormField
                control={form.control}
                name="formula"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Formula</FormLabel>
                    <FormControl>
                      <div className="border rounded-md overflow-hidden">
                        <Editor
                          height="400px"
                          language="javascript"
                          theme="vs-dark"
                          value={field.value}
                          onChange={(val) => field.onChange(val || "")}
                          options={{
                            minimap: { enabled: false },
                            formatOnPaste: true,
                            bracketPairColorization: { enabled: true },
                            lineNumbers: "on",
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2">
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Save Variable
                </Button>
                {editingId && (
                  <Button variant="outline" onClick={() => { setEditingId(null); form.reset(); }}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Variables</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variables?.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono">{v.name}</TableCell>
                    <TableCell className="capitalize">{v.type}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(v)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
