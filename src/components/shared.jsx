import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, QrCode } from "lucide-react";

export function ScoreControl({ value, onIncrease, onDecrease, disabled }) {
  return (
    <div className="score-control">
      <button type="button" onClick={onIncrease} disabled={disabled} aria-label="Tor hinzufügen">
        <ChevronUp size={22} />
      </button>
      <strong>{Number.isInteger(value) ? value : "-"}</strong>
      <button type="button" onClick={onDecrease} disabled={disabled} aria-label="Tor entfernen">
        <ChevronDown size={22} />
      </button>
    </div>
  );
}

export function QrCodeImage({ value }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;

    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(value, {
          errorCorrectionLevel: "M",
          margin: 1,
          scale: 7,
          color: {
            dark: "#071b45",
            light: "#ffffff",
          },
        }),
      )
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <span className="qr-image">
      {src ? <img src={src} alt={`QR-Code für ${value}`} /> : <QrCode size={42} />}
    </span>
  );
}

export async function createQrCodeDataUrl(value) {
  const { default: QRCode } = await import("qrcode");
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 7,
    color: {
      dark: "#071b45",
      light: "#ffffff",
    },
  });
}
