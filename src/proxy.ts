import { NextRequest, NextResponse } from "next/server";

// SITE_PASSWORD 환경변수가 설정된 경우에만 HTTP Basic 인증으로 사이트 전체를 보호한다.
// 값이 없으면(로컬 개발 등) 보호 없이 통과시킨다.
export function proxy(request: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) return NextResponse.next();

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (password === sitePassword) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
