import { useRef, useState } from "react";
import styles from "./EmptyState.module.css";

type EmptyStateProps = {
  onUpload: (dataUrl: string) => void;
};

function readImageFile(
  file: File | undefined,
  onUpload: (dataUrl: string) => void,
) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") onUpload(reader.result);
  };
  reader.readAsDataURL(file);
}

export function EmptyState({ onUpload }: EmptyStateProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={styles.empty}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        readImageFile(e.dataTransfer.files?.[0], onUpload);
      }}
    >
      <div className={`${styles.card} ${dragging ? styles.dragging : ""}`}>
        <h2>dimensional</h2>
        <p>
          Upload a floor plan image, calibrate a known wall length, then place
          furniture at real-world size.
        </p>
        <input
          ref={fileRef}
          className={styles.fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => {
            readImageFile(e.target.files?.[0], onUpload);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => fileRef.current?.click()}
        >
          Upload floor plan
        </button>
        <p className={styles.dropHint}>or drop an image here</p>
      </div>
    </div>
  );
}
