"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  LoginSchema,
  ResetPasswordSchema,
  SignupSchema,
  fieldErrorsOf,
  type FormState,
} from "@/lib/validation";

export async function signup(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = SignupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) return { error: error.message };

  // Email confirmation is disabled, so signUp returns a session immediately.
  // If for some reason there's no session, fall back to signing in.
  if (!data.session) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (signInError) return { error: signInError.message };
  }

  const redirectedFrom = formData.get("redirectedFrom");
  redirect(
    typeof redirectedFrom === "string" && redirectedFrom ? redirectedFrom : "/",
  );
}

export async function login(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return { error: error.message };

  const redirectedFrom = formData.get("redirectedFrom");
  redirect(typeof redirectedFrom === "string" && redirectedFrom ? redirectedFrom : "/");
}

export async function updatePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = ResetPasswordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) return { error: error.message };

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Sign out from an invite page (wrong account signed in) and come back to the
// same invite after re-authenticating.
export async function signOutToInvite(token: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/login?redirectedFrom=${encodeURIComponent(`/invite/${token}`)}`);
}

// Same, for personal DM invitations.
export async function signOutToDmInvite(token: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(
    `/login?redirectedFrom=${encodeURIComponent(`/dm-invite/${token}`)}`,
  );
}
