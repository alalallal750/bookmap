import { NextResponse } from "next/server";
import { DONGJAK_LIBRARIES } from "@/constants/libraries";
import { ApiResponse } from "@/types";

export async function GET() {
  return NextResponse.json<ApiResponse<typeof DONGJAK_LIBRARIES>>({
    success: true,
    data: DONGJAK_LIBRARIES,
  });
}
