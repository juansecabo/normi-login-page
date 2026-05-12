import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface FirmaImageProps {
  url: string;
  alt?: string;
  className?: string;
}

const FirmaImage = ({ url, alt = "Firma", className = "max-h-20 border border-border rounded p-1 bg-white" }: FirmaImageProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={url}
        alt={alt}
        className={`${className} cursor-zoom-in hover:opacity-80 transition-opacity`}
        onClick={() => setOpen(true)}
        title="Clic para ampliar"
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <img src={url} alt={alt} className="w-full bg-white rounded border" />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FirmaImage;
