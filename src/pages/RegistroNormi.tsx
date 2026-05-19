import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isProfesor, puedeAccederDashboard, isAdmin } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Search, Download } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADOS = [
  "Prejardín", "Jardín", "Transición",
  "Primero", "Segundo", "Tercero", "Cuarto", "Quinto",
  "Sexto", "Séptimo", "Octavo", "Noveno",
  "Décimo", "Undécimo",
];

const SALONES = ["1", "2", "3", "4", "5", "6"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Estudiante {
  id: number;
  nombres: string;
  apellidos: string;
  grado: string;
  salon: string;
}

interface Perfil {
  perfil: string;
  estudiante_id: number | null;
  padre_estudiante1_id: number | null;
  padre_estudiante2_id: number | null;
  padre_estudiante3_id: number | null;
  padre_estudiante4_id: number | null;
  padre_nombre: string | null;
  numero_de_telefono: string | null;
}

interface ParentInfo {
  padre_nombre: string;
  telefono: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function fetchAllPages<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data } = await makeQuery(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ─── Component ────────────────────────────────────────────────────────────────

const RegistroNormi = () => {
  const navigate = useNavigate();

  // Auth
  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    if (!isProfesor() && !puedeAccederDashboard()) { navigate("/dashboard"); return; }
  }, [navigate]);

  const backLink = isAdmin() ? "/dashboard-admin" : puedeAccederDashboard() ? "/dashboard-rector" : "/dashboard";

  // State
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [gradoFilter, setGradoFilter] = useState("todos");
  const [salonFilter, setSalonFilter] = useState("todos");
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("estudiantes");

  // Fetch data — Acudientes + Estudiantes con teléfono
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [est, acuds] = await Promise.all([
        fetchAllPages<Estudiante>((from, to) =>
          supabase
            .from("Estudiantes")
            .select("id, nombres, apellidos, grado, salon")
            .order("apellidos")
            .order("nombres")
            .range(from, to)
        ),
        fetchAllPages<any>((from, to) =>
          supabase
            .from("Acudientes")
            .select("id, acudido1_id, acudido2_id, acudido3_id, acudido4_id")
            .range(from, to)
        ),
      ]);

      // Estudiantes registrados: Usuarios con id = Estudiantes.id y teléfono no nulo
      // (Fase 10.E.15 — el teléfono solo vive en Usuarios)
      const estudianteIdsStr = est.map((e) => String(e.id));
      const usuariosEstMap = new Map<string, any>();
      if (estudianteIdsStr.length > 0) {
        const usuariosEst = await fetchAllPages<any>((from, to) =>
          supabase
            .from("Usuarios")
            .select("id, numero_de_telefono")
            .in("id", estudianteIdsStr)
            .not("numero_de_telefono", "is", null)
            .range(from, to)
        );
        for (const u of usuariosEst as any[]) usuariosEstMap.set(String(u.id), u);
      }

      // Construir lista combinada de perfiles
      const acudienteIds = (acuds as any[]).map((a) => a.id);
      // Traer nombres y teléfonos desde Usuarios para los acudientes
      const usuariosMap = new Map<string, any>();
      if (acudienteIds.length > 0) {
        const usuarios = await fetchAllPages<any>((from, to) =>
          supabase
            .from("Usuarios")
            .select("id, nombres, apellidos, numero_de_telefono")
            .in("id", acudienteIds)
            .range(from, to)
        );
        for (const u of usuarios as any[]) usuariosMap.set(String(u.id), u);
      }

      // Perfiles del modelo nuevo (Acudientes + Usuarios)
      const perfilesAcudientes: Perfil[] = (acuds as any[]).map((a) => {
        const u = usuariosMap.get(String(a.id));
        return {
          perfil: "Padre de familia",
          padre_nombre: u ? `${u.nombres || ""} ${u.apellidos || ""}`.trim() : "",
          numero_de_telefono: u?.numero_de_telefono || "",
          padre_estudiante1_id: a.acudido1_id,
          padre_estudiante2_id: a.acudido2_id,
          padre_estudiante3_id: a.acudido3_id,
          padre_estudiante4_id: a.acudido4_id,
        } as Perfil;
      });

      // Perfiles de estudiantes registrados (Usuarios con teléfono cuyo id está en Estudiantes)
      const perfilesEstudiantes: Perfil[] = [];
      for (const [idStr, u] of usuariosEstMap.entries()) {
        const idNum = Number(idStr);
        if (!Number.isFinite(idNum)) continue;
        perfilesEstudiantes.push({
          perfil: "Estudiante",
          estudiante_id: idNum,
          numero_de_telefono: u.numero_de_telefono,
        } as Perfil);
      }

      const combinados = [...perfilesAcudientes, ...perfilesEstudiantes];

      setEstudiantes(est);
      setPerfiles(combinados);
      setLoading(false);
    };
    fetchData();
  }, []);

  // Build lookup sets
  const estudianteIdsRegistrados = useMemo(() => {
    const set = new Set<number>();
    for (const p of perfiles) {
      if (p.perfil === "Estudiante" && p.estudiante_id) {
        set.add(p.estudiante_id);
      }
    }
    return set;
  }, [perfiles]);

  const padreInfoPorId = useMemo(() => {
    const map = new Map<number, ParentInfo[]>();
    for (const p of perfiles) {
      if (p.perfil === "Padre de familia") {
        const info: ParentInfo = {
          padre_nombre: p.padre_nombre || "Sin nombre",
          telefono: p.numero_de_telefono || "Sin teléfono",
        };
        for (const cod of [p.padre_estudiante1_id, p.padre_estudiante2_id, p.padre_estudiante3_id, p.padre_estudiante4_id]) {
          if (cod) {
            const arr = map.get(cod) || [];
            arr.push(info);
            map.set(cod, arr);
          }
        }
      }
    }
    return map;
  }, [perfiles]);

  // Filtered students
  const filtered = useMemo(() => {
    return estudiantes.filter((e) => {
      if (gradoFilter !== "todos" && e.grado !== gradoFilter) return false;
      if (salonFilter !== "todos" && e.salon !== salonFilter) return false;
      if (search) {
        const hay = normalize(`${e.apellidos} ${e.nombres} ${e.id}`);
        if (!hay.includes(normalize(search))) return false;
      }
      return true;
    });
  }, [estudiantes, gradoFilter, salonFilter, search]);

  // Stats (based on filtered before estado filter, so the summary stays meaningful)
  const estRegistrados = useMemo(
    () => filtered.filter((e) => estudianteIdsRegistrados.has(e.id)).length,
    [filtered, estudianteIdsRegistrados]
  );
  const padRegistrados = useMemo(
    () => filtered.filter((e) => padreInfoPorId.has(e.id)).length,
    [filtered, padreInfoPorId]
  );

  // Displayed rows per tab (apply estadoFilter on top of filtered)
  const displayedEstudiantes = useMemo(() => {
    if (estadoFilter === "todos") return filtered;
    return filtered.filter((e) => {
      const reg = estudianteIdsRegistrados.has(e.id);
      return estadoFilter === "registrados" ? reg : !reg;
    });
  }, [filtered, estadoFilter, estudianteIdsRegistrados]);

  const displayedPadres = useMemo(() => {
    if (estadoFilter === "todos") return filtered;
    return filtered.filter((e) => {
      const reg = padreInfoPorId.has(e.id);
      return estadoFilter === "registrados" ? reg : !reg;
    });
  }, [filtered, estadoFilter, padreInfoPorId]);

  const [selectedParents, setSelectedParents] = useState<{ padres: ParentInfo[]; estudiante: string } | null>(null);

  const handleExport = async () => {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Normi";
    workbook.created = new Date();

    const filterParts: string[] = [];
    if (gradoFilter !== "todos") filterParts.push(`Grado: ${gradoFilter}`);
    if (salonFilter !== "todos") filterParts.push(`Salón ${salonFilter}`);
    if (estadoFilter === "registrados") filterParts.push("Solo registrados");
    else if (estadoFilter === "no-registrados") filterParts.push("Solo no registrados");
    const filterLabel = filterParts.length > 0 ? filterParts.join("   •   ") : "Todos los estudiantes";

    const dateStr = new Intl.DateTimeFormat("es-CO", {
      day: "numeric", month: "long", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    }).format(new Date());

    const filenameParts = filterParts.map((p) => p.replace(/[^\p{L}\p{N}]+/gu, "")).filter(Boolean);
    const fileFilterSuffix = filenameParts.length > 0 ? filenameParts.join("-") : "Todos";

    type ColSpec = { header: string; key: string; width: number };
    type RowData = Record<string, string | number>;

    const buildSheet = (
      sheetName: string,
      title: string,
      cols: ColSpec[],
      rows: RowData[],
      estadoKey: string,
    ) => {
      const ws = workbook.addWorksheet(sheetName);
      const nCols = cols.length;

      // Row 1: Title (merged, bold green, centered)
      ws.mergeCells(1, 1, 1, nCols);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = title;
      titleCell.font = { bold: true, size: 18, color: { argb: "FF15803D" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 36;

      // Row 2: Subtitle (merged, small grey italic, centered)
      ws.mergeCells(2, 1, 2, nCols);
      const subtitleCell = ws.getCell(2, 1);
      subtitleCell.value = `${filterLabel}   —   Generado el ${dateStr}`;
      subtitleCell.font = { size: 10, color: { argb: "FF6B7280" }, italic: true };
      subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(2).height = 20;

      // Row 3: thin spacer
      ws.getRow(3).height = 6;

      // Column widths
      cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

      // Row 4: Header
      const headerRow = ws.getRow(4);
      headerRow.values = cols.map((c) => c.header);
      headerRow.height = 28;
      cols.forEach((_c, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15803D" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        cell.border = {
          top: { style: "medium", color: { argb: "FF14532D" } },
          bottom: { style: "medium", color: { argb: "FF14532D" } },
          left: { style: "thin", color: { argb: "FF14532D" } },
          right: { style: "thin", color: { argb: "FF14532D" } },
        };
      });

      const estadoIdx = cols.findIndex((c) => c.key === estadoKey) + 1;

      // Data rows start at row 5
      rows.forEach((data, i) => {
        const r = ws.getRow(5 + i);
        r.height = 22;
        cols.forEach((c, j) => { r.getCell(j + 1).value = data[c.key] ?? ""; });
        const isAlt = i % 2 === 1;
        cols.forEach((_c, j) => {
          const cell = r.getCell(j + 1);
          cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
          cell.border = {
            top: { style: "hair", color: { argb: "FFE5E7EB" } },
            bottom: { style: "hair", color: { argb: "FFE5E7EB" } },
            left: { style: "hair", color: { argb: "FFE5E7EB" } },
            right: { style: "hair", color: { argb: "FFE5E7EB" } },
          };
          if (isAlt) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
          }
        });
        const estadoCell = r.getCell(estadoIdx);
        const val = String(estadoCell.value ?? "");
        if (val === "Registrado") {
          estadoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
          estadoCell.font = { color: { argb: "FF14532D" }, bold: true };
        } else if (val === "No registrado") {
          estadoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          estadoCell.font = { color: { argb: "FF991B1B" }, bold: true };
        }
      });

      // Freeze title + subtitle + spacer + header
      ws.views = [{ state: "frozen", ySplit: 4 }];

      // AutoFilter on header row
      ws.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: 4, column: nCols },
      };
    };

    if (activeTab === "estudiantes") {
      const cols: ColSpec[] = [
        { header: "ID", key: "id", width: 14 },
        { header: "Apellidos", key: "apellidos", width: 28 },
        { header: "Nombres", key: "nombres", width: 28 },
        { header: "Grado", key: "grado", width: 14 },
        { header: "Salón", key: "salon", width: 10 },
        { header: "Estado", key: "estado", width: 18 },
      ];
      const rows: RowData[] = displayedEstudiantes.map((e) => ({
        id: e.id,
        apellidos: e.apellidos,
        nombres: e.nombres,
        grado: e.grado,
        salon: e.salon,
        estado: estudianteIdsRegistrados.has(e.id) ? "Registrado" : "No registrado",
      }));
      buildSheet("Estudiantes", "Registro en Normi — Estudiantes", cols, rows, "estado");
    } else {
      const cols: ColSpec[] = [
        { header: "ID estudiante", key: "id", width: 14 },
        { header: "Apellidos estudiante", key: "apellidos", width: 28 },
        { header: "Nombres estudiante", key: "nombres", width: 28 },
        { header: "Grado", key: "grado", width: 14 },
        { header: "Salón", key: "salon", width: 10 },
        { header: "Estado padre", key: "estado", width: 18 },
        { header: "Nombre del padre", key: "padre", width: 30 },
        { header: "Teléfono", key: "telefono", width: 18 },
      ];
      const rows: RowData[] = [];
      for (const e of displayedPadres) {
        const padres = padreInfoPorId.get(e.id);
        if (!padres || padres.length === 0) {
          rows.push({
            id: e.id,
            apellidos: e.apellidos,
            nombres: e.nombres,
            grado: e.grado,
            salon: e.salon,
            estado: "No registrado",
            padre: "",
            telefono: "",
          });
        } else {
          for (const p of padres) {
            rows.push({
              id: e.id,
              apellidos: e.apellidos,
              nombres: e.nombres,
              grado: e.grado,
              salon: e.salon,
              estado: "Registrado",
              padre: p.padre_nombre,
              telefono: p.telefono,
            });
          }
        }
      }
      buildSheet("Padres", "Registro en Normi — Padres", cols, rows, "estado");
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Registro-Normi-${activeTab === "estudiantes" ? "Estudiantes" : "Padres"}-${fileFilterSuffix}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const total = filtered.length;
  const estPct = total > 0 ? Math.round((estRegistrados / total) * 100) : 0;
  const padPct = total > 0 ? Math.round((padRegistrados / total) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <HeaderNormi backLink={backLink} />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />

      <main className="flex-1 container mx-auto p-4 lg:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6 max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Registro en Normi</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground max-w-4xl mx-auto mb-6 text-center">Revisa qué estudiantes y padres están registrados o no con Normi.</p>

        <h2 className="text-2xl font-bold text-foreground text-center mb-6">
          Registro en Normi
        </h2>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6 max-w-4xl mx-auto">
          <Select value={gradoFilter} onValueChange={(v) => { setGradoFilter(v); setSalonFilter("todos"); }}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Grado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los grados</SelectItem>
              {GRADOS.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={salonFilter} onValueChange={setSalonFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Salón" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los salones</SelectItem>
              {SALONES.map((s) => (
                <SelectItem key={s} value={s}>Salón {s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="registrados">Solo registrados</SelectItem>
              <SelectItem value="no-registrados">Solo no registrados</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o id..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Download button */}
        <div className="flex justify-end mb-3 max-w-4xl mx-auto">
          <Button
            onClick={handleExport}
            variant="outline"
            size="sm"
            disabled={(activeTab === "estudiantes" ? displayedEstudiantes : displayedPadres).length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Descargar Excel
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-4xl mx-auto">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="estudiantes"
              className="data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=active]:shadow-sm font-medium"
            >
              Estudiantes
            </TabsTrigger>
            <TabsTrigger
              value="padres"
              className="data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=active]:shadow-sm font-medium"
            >
              Padres
            </TabsTrigger>
          </TabsList>

          {/* Tab Estudiantes */}
          <TabsContent value="estudiantes">
            <div className="bg-card rounded-lg shadow-soft p-4 lg:p-6">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">
                    {estadoFilter === "todos"
                      ? `${estRegistrados} de ${total} registrados (${estPct}%)`
                      : estadoFilter === "registrados"
                        ? `Mostrando ${displayedEstudiantes.length} registrado${displayedEstudiantes.length === 1 ? "" : "s"} de ${total}`
                        : `Mostrando ${displayedEstudiantes.length} no registrado${displayedEstudiantes.length === 1 ? "" : "s"} de ${total}`}
                  </span>
                </div>
                {estadoFilter === "todos" && <Progress value={estPct} className="h-3" />}
              </div>

              <div className="overflow-x-auto">
                <Table style={{ tableLayout: "auto" }}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="whitespace-nowrap">Nombre</TableHead>
                      <TableHead className="whitespace-nowrap">Grado</TableHead>
                      <TableHead className="whitespace-nowrap">Salón</TableHead>
                      <TableHead className="text-center whitespace-nowrap">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedEstudiantes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No se encontraron estudiantes
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedEstudiantes.map((e, i) => {
                        const registrado = estudianteIdsRegistrados.has(e.id);
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium whitespace-nowrap">
                              {e.apellidos}, {e.nombres}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{e.grado}</TableCell>
                            <TableCell>{e.salon}</TableCell>
                            <TableCell className="text-center">
                              <Badge className={`w-20 justify-center ${registrado
                                ? "bg-green-500 hover:bg-green-600 text-white"
                                : "bg-red-500 hover:bg-red-600 text-white"
                              }`}>
                                {registrado ? "Registrado" : "No registrado"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* Tab Padres */}
          <TabsContent value="padres">
            <div className="bg-card rounded-lg shadow-soft p-4 lg:p-6">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">
                    {estadoFilter === "todos"
                      ? `${padRegistrados} de ${total} con padre registrado (${padPct}%)`
                      : estadoFilter === "registrados"
                        ? `Mostrando ${displayedPadres.length} con padre registrado de ${total}`
                        : `Mostrando ${displayedPadres.length} sin padre registrado de ${total}`}
                  </span>
                </div>
                {estadoFilter === "todos" && <Progress value={padPct} className="h-3" />}
              </div>

              <div className="overflow-x-auto">
                <Table style={{ tableLayout: "auto" }}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="whitespace-nowrap">Nombre del estudiante</TableHead>
                      <TableHead className="whitespace-nowrap">Grado</TableHead>
                      <TableHead className="whitespace-nowrap">Salón</TableHead>
                      <TableHead className="whitespace-nowrap">Padre en Normi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedPadres.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No se encontraron estudiantes
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedPadres.map((e, i) => {
                        const parentInfo = padreInfoPorId.get(e.id);
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium whitespace-nowrap">
                              {e.apellidos}, {e.nombres}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{e.grado}</TableCell>
                            <TableCell>{e.salon}</TableCell>
                            <TableCell>
                              <Badge className={`w-20 justify-center text-center ${parentInfo
                                ? "bg-green-500 hover:bg-green-600 text-white"
                                : "bg-red-500 hover:bg-red-600 text-white"
                              }`}>
                                {parentInfo ? "Registrado" : "No registrado"}
                              </Badge>
                              {parentInfo && (
                                <button
                                  onClick={() => setSelectedParents({
                                    padres: parentInfo,
                                    estudiante: `${e.apellidos}, ${e.nombres}`,
                                  })}
                                  className="ml-2 text-xs text-primary hover:underline font-medium"
                                >
                                  Ver info
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Parent info popup */}
        {selectedParents && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedParents(null)} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Info del padre</h3>
              <p className="text-sm text-gray-500 mb-4">{selectedParents.estudiante}</p>
              <div className="space-y-4">
                {selectedParents.padres.map((p, i) => (
                  <div key={i} className="space-y-1 text-sm text-gray-700">
                    {selectedParents.padres.length > 1 && (
                      <p className="font-semibold text-gray-900">Padre {i + 1}</p>
                    )}
                    <p><span className="font-medium">Nombre:</span> {p.padre_nombre}</p>
                    <p><span className="font-medium">Teléfono:</span> {p.telefono}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setSelectedParents(null)}
                className="mt-5 w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default RegistroNormi;
