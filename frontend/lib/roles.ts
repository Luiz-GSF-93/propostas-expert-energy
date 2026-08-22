export type RoleLikeProfile = {
  role?: string | null;
  profile?: string | null;
  role_label?: string | null;
};

export function normalizeUserRole(
  profile?: Pick<RoleLikeProfile, "role" | "profile" | "role_label"> | null
) {
  const candidates = [profile?.role, profile?.profile, profile?.role_label]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (["admin", "administrator", "administrador"].includes(candidate)) {
      return "admin";
    }

    if (["seller", "comercial", "commercial"].includes(candidate)) {
      return "comercial";
    }

    if (["manager", "gestor"].includes(candidate)) {
      return "manager";
    }
  }

  return candidates[0] || "";
}

export function canAccessDiagnostics(
  profile?: Pick<RoleLikeProfile, "role" | "profile" | "role_label"> | null
) {
  const normalizedRole = normalizeUserRole(profile);
  return normalizedRole === "admin" || normalizedRole === "comercial";
}

export function formatNormalizedRoleLabel(role?: string) {
  switch (role) {
    case "admin":
      return "Administrador";
    case "comercial":
      return "Comercial";
    case "manager":
      return "Gestor";
    default:
      return role || "Não identificado";
  }
}
