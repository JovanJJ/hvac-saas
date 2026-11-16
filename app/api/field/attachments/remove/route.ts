import { photoCommand } from "@/features/evidence/http";
export async function POST(request: Request) {
  return photoCommand(request, "remove");
}
