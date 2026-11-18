import { offlinePhotoCommand } from "@/features/offline/photo-http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  return offlinePhotoCommand(request, (await params).kind);
}
