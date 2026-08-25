import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ImagePlus, Upload } from "lucide-react";
import React, { useState } from "react";

const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const PROFILE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateProfilePhotoFile(file: File) {
  if (!PROFILE_PHOTO_TYPES.includes(file.type)) return "Selecione uma imagem JPEG, PNG ou WEBP.";
  if (file.size > MAX_PROFILE_PHOTO_BYTES) return "A foto de perfil deve ter no máximo 2 MB.";
  return null;
}

export function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a foto selecionada."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const base64 = dataUrl.includes(",") ? dataUrl.split(",", 2)[1] : "";
      if (!base64) reject(new Error("Não foi possível preparar a foto selecionada."));
      else resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

export function ProfilePhotoControl({ userId, name, currentUrl, onPhotoUpdated }: { userId: number; name: string; currentUrl?: string | null; onPhotoUpdated?: (url: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const utils = trpc.useUtils();
  const upload = trpc.access.uploadUserProfilePhoto.useMutation({
    onSuccess: result => {
      setFile(null);
      setPreview(result.url);
      setSelectionError("");
      onPhotoUpdated?.(result.url);
      utils.access.users.invalidate();
      utils.access.myProfilePhoto.invalidate();
      utils.audit.operations.invalidate();
    },
  });

  const selectFile = (candidate?: File) => {
    if (!candidate) return;
    const error = validateProfilePhotoFile(candidate);
    if (error) {
      setFile(null);
      setPreview(null);
      setSelectionError(error);
      return;
    }
    setFile(candidate);
    setSelectionError("");
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(candidate);
  };

  const uploadPhoto = async () => {
    if (!file) return;
    try {
      upload.mutate({ userId, fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: await fileToBase64(file) });
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Não foi possível preparar a foto selecionada.");
    }
  };

  const initials = name.trim().split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "U";
  return (
    <section className="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar className="h-16 w-16 border-2 border-white shadow-sm"><AvatarImage src={preview ?? currentUrl ?? undefined} alt={`Foto de ${name}`} /><AvatarFallback className="bg-sky-100 text-sm font-semibold text-sky-800">{initials}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <Label htmlFor={`profile-photo-${userId}`} className="font-medium text-slate-900">Foto de perfil</Label>
          <p className="mt-1 text-xs leading-5 text-slate-600">Envie JPEG, PNG ou WEBP de até 2 MB. A foto substitui somente a referência anterior e a alteração fica auditada.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2"><Input id={`profile-photo-${userId}`} type="file" accept="image/jpeg,image/png,image/webp" className="max-w-xs bg-white text-xs" onChange={event => selectFile(event.target.files?.[0])} /><Button type="button" size="sm" variant="outline" disabled={!file || upload.isPending} onClick={() => void uploadPhoto()}><Upload className="mr-1.5 h-3.5 w-3.5" />{upload.isPending ? "Enviando..." : "Enviar foto"}</Button></div>
        </div>
        {!currentUrl && !preview && <ImagePlus className="hidden h-5 w-5 text-sky-600 sm:block" aria-hidden="true" />}
      </div>
      {(selectionError || upload.error) && <p role="alert" className="mt-3 text-sm text-rose-700">{selectionError || upload.error?.message}</p>}
    </section>
  );
}
