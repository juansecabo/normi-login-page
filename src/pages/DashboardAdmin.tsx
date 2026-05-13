import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isAdmin } from "@/hooks/useSession";
import iconNotas from "@/assets/icons/notas.webp";
import iconEstadisticas from "@/assets/icons/estadisticas.webp";
import iconEnviarComunicado from "@/assets/icons/enviar-comunicado.webp";
import iconPanelControl from "@/assets/icons/panel-de-control.webp";
import iconRegistroAgente from "@/assets/icons/registro-agente.webp";
import iconUsoAgente from "@/assets/icons/uso-agente.webp";
import iconSugerencias from "@/assets/icons/sugerencias.webp";
import iconConversaciones from "@/assets/icons/conversaciones.webp";
import iconActividades from "@/assets/icons/actividades.webp";
import iconPermisos from "@/assets/icons/permisos-y-excusas.webp";
import iconConsultas from "@/assets/icons/consultas.png";
import iconRegistros from "@/assets/icons/registros-comportamiento.png";
import HeaderNormy from "@/components/HeaderNormy";

const DashboardAdmin = () => {
  const navigate = useNavigate();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");

  useEffect(() => {
    const session = getSession();

    if (!session.id) {
      navigate("/");
      return;
    }

    if (!isAdmin()) {
      navigate("/dashboard");
      return;
    }

    setNombres(session.nombres || "");
    setApellidos(session.apellidos || "");
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard-admin" />

      <main className="flex-1 container mx-auto p-8">
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-2xl mx-auto text-center">
          <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-4">
            Bienvenido(a)
          </h2>
          <p className="text-xl text-primary font-semibold">
            {nombres} {apellidos}
          </p>
          <p className="text-muted-foreground mt-2">
            Administrador
          </p>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto mt-8">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            ¿Qué deseas consultar?
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 max-w-5xl mx-auto">
            <button
              onClick={() => navigate("/rector/seleccionar-grado")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-emerald-100 transition-all duration-200 hover:shadow-md hover:bg-emerald-200"
            >
              <img src={iconNotas} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground">Notas</span>
            </button>

            <button
              onClick={() => navigate("/rector/estadisticas")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-green-100 transition-all duration-200 hover:shadow-md hover:bg-green-200"
            >
              <img src={iconEstadisticas} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground">Estadísticas</span>
            </button>

            <button
              onClick={() => navigate("/enviar-comunicado-admin")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-teal-100 transition-all duration-200 hover:shadow-md hover:bg-teal-200"
            >
              <img src={iconEnviarComunicado} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Enviar Comunicado</span>
            </button>

            <button
              onClick={() => navigate("/admin/todas-actividades")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-emerald-100 transition-all duration-200 hover:shadow-md hover:bg-emerald-200"
            >
              <img src={iconActividades} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Todas las Actividades</span>
            </button>


            <button
              onClick={() => navigate("/rector/panel-control")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-purple-100 transition-all duration-200 hover:shadow-md hover:bg-purple-200"
            >
              <img src={iconPanelControl} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Panel de Control</span>
            </button>

            <button
              onClick={() => navigate("/admin/sugerencias")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-amber-100 transition-all duration-200 hover:shadow-md hover:bg-amber-200"
            >
              <img src={iconSugerencias} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Sugerencias</span>
            </button>

            <button
              onClick={() => navigate("/rector/uso-normy")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-orange-100 transition-all duration-200 hover:shadow-md hover:bg-orange-200"
            >
              <img src={iconUsoAgente} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Uso de Normy</span>
            </button>

            <button
              onClick={() => navigate("/registro-normy")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-cyan-100 transition-all duration-200 hover:shadow-md hover:bg-cyan-200"
            >
              <img src={iconRegistroAgente} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Registro en Normy</span>
            </button>

            <button
              onClick={() => window.open("https://chat.notasnormy.com", "_blank")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-blue-100 transition-all duration-200 hover:shadow-md hover:bg-blue-200"
            >
              <img src={iconConversaciones} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Conversaciones</span>
            </button>

            <button
              onClick={() => navigate("/permisos-excusas")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-rose-100 transition-all duration-200 hover:shadow-md hover:bg-rose-200"
            >
              <img src={iconPermisos} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Permisos y Excusas</span>
            </button>

            <button
              onClick={() => navigate("/consultas")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-pink-100 transition-all duration-200 hover:shadow-md hover:bg-pink-200"
            >
              <img src={iconConsultas} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Consultas</span>
            </button>

            <button
              onClick={() => navigate("/registros-comportamiento")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-amber-100 transition-all duration-200 hover:shadow-md hover:bg-amber-200"
            >
              <img src={iconRegistros} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Registros de Comportamiento</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardAdmin;
