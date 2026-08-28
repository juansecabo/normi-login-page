import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface BotonDescargaProps {
  contenidoRef: React.RefObject<HTMLDivElement>;
  nombreArchivo?: string;
}

const BotonDescarga = ({ contenidoRef, nombreArchivo = "estadisticas" }: BotonDescargaProps) => {
  const [descargando, setDescargando] = useState(false);

  const descargarPDF = async () => {
    if (!contenidoRef.current) return;
    
    setDescargando(true);
    
    try {
      // Clonar el contenido para no afectar el original
      const contenidoOriginal = contenidoRef.current;
      const clon = contenidoOriginal.cloneNode(true) as HTMLElement;
      
      // Aplicar estilos al clon para la captura
      clon.style.width = "1100px";
      clon.style.position = "absolute";
      clon.style.left = "-9999px";
      clon.style.top = "0";
      clon.style.backgroundColor = "white";
      clon.style.padding = "20px";
      clon.style.overflow = "visible";
      
      // Ocultar botones en el clon
      const botones = clon.querySelectorAll("button");
      botones.forEach((btn) => {
        (btn as HTMLElement).style.display = "none";
      });
      
      // Asegurar que el texto no se corte en el clon
      const todosLosElementos = clon.querySelectorAll("*");
      todosLosElementos.forEach((el) => {
        const elemento = el as HTMLElement;
        elemento.style.overflow = "visible";
        elemento.style.textOverflow = "clip";
        elemento.style.whiteSpace = "normal";
      });
      
      document.body.appendChild(clon);
      
      const canvas = await html2canvas(clon, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 1100,
      });
      
      // Remover el clon después de capturar
      document.body.removeChild(clon);
      
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pdfWidth - margin * 2;
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = contentWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;
      
      const pageContentHeight = pdfHeight - margin * 2;
      let yPosition = 0;
      let pageNumber = 0;
      
      while (yPosition < scaledHeight) {
        if (pageNumber > 0) {
          pdf.addPage();
        }
        
        const sourceY = (yPosition / ratio);
        const sourceHeight = Math.min(pageContentHeight / ratio, imgHeight - sourceY);
        const destHeight = sourceHeight * ratio;
        
        // Crear un canvas temporal para esta porción
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = imgWidth;
        tempCanvas.height = sourceHeight;
        const tempCtx = tempCanvas.getContext("2d");
        
        if (tempCtx) {
          tempCtx.drawImage(
            canvas,
            0, sourceY, imgWidth, sourceHeight,
            0, 0, imgWidth, sourceHeight
          );
          
          const tempImgData = tempCanvas.toDataURL("image/png");
          pdf.addImage(tempImgData, "PNG", margin, margin, contentWidth, destHeight);
        }
        
        yPosition += pageContentHeight;
        pageNumber++;
      }
      
      pdf.save(`${nombreArchivo}.pdf`);
    } catch (error) {
      console.error("Error al generar PDF:", error);
    } finally {
      setDescargando(false);
    }
  };

  return (
    <Button
      onClick={descargarPDF}
      disabled={descargando}
      variant="outline"
      size="sm"
      className="flex items-center gap-2"
      data-guia="estadisticas.boton_descargar_pdf"
    >
      {descargando ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Generando...
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          Descargar PDF
        </>
      )}
    </Button>
  );
};

export default BotonDescarga;
