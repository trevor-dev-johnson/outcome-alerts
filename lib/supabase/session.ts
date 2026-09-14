type LocalSignOutClient = {
  auth: {
    signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
  };
};

export async function clearLocalSession(client: LocalSignOutClient) {
  const { error } = await client.auth.signOut({ scope: "local" });
  return error;
}
