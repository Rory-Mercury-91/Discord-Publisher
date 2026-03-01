import type { AdditionalTranslationLink, PublishedPost } from '../types';

/**
 * Parse les champs jsonb renvoyés par Supabase (parfois en string).
 */
export function parseJsonb<T>(val: unknown): T | undefined {
  if (val == null) return undefined;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return undefined;
    }
  }
  return val as T;
}

/**
 * Convertit un PublishedPost en ligne Supabase (table published_posts).
 */
export function postToRow(p: PublishedPost): Record<string, unknown> {
  const createdTs = p.createdAt ?? p.timestamp;
  const updatedTs = p.updatedAt ?? p.timestamp;
  return {
    id: p.id,
    title: p.title ?? '',
    content: p.content ?? '',
    tags: p.tags ?? '',
    image_path: p.imagePath ?? null,
    translation_type: p.translationType ?? null,
    is_integrated: p.isIntegrated ?? false,
    thread_id: p.threadId ?? '',
    message_id: p.messageId ?? '',
    discord_url: p.discordUrl ?? '',
    forum_id: Number(p.forumId) || 0,
    author_discord_id: p.authorDiscordId ?? null,
    author_external_translator_id: p.authorExternalTranslatorId ?? null,
    saved_inputs: p.savedInputs ?? null,
    saved_link_configs: p.savedLinkConfigs ?? null,
    saved_additional_translation_links: Array.isArray(p.savedAdditionalTranslationLinks)
      ? p.savedAdditionalTranslationLinks
      : (p.savedAdditionalTranslationLinks ?? null),
    saved_additional_mod_links: Array.isArray(p.savedAdditionalModLinks)
      ? p.savedAdditionalModLinks
      : (p.savedAdditionalModLinks ?? null),
    is_archived: p.archived ?? false,
    template_id: p.templateId ?? null,
    created_at: new Date(createdTs).toISOString(),
    updated_at: new Date(updatedTs).toISOString()
  };
}

/**
 * Convertit une ligne Supabase (published_posts) en PublishedPost.
 */
export function rowToPost(r: Record<string, unknown>): PublishedPost {
  const createdStr = r.created_at as string;
  const updatedStr = r.updated_at as string;
  const createdAt = createdStr ? new Date(createdStr).getTime() : Date.now();
  const updatedAt = updatedStr ? new Date(updatedStr).getTime() : createdAt;
  const ts = updatedAt;
  const savedInputs = parseJsonb<Record<string, string>>(r.saved_inputs);
  const savedLinkConfigs = parseJsonb<PublishedPost['savedLinkConfigs']>(r.saved_link_configs);
  const savedAdditionalTranslationLinks = parseJsonb<AdditionalTranslationLink[]>(
    r.saved_additional_translation_links
  );
  const savedAdditionalModLinks = parseJsonb<AdditionalTranslationLink[]>(r.saved_additional_mod_links);
  return {
    id: String(r.id),
    timestamp: ts,
    createdAt,
    updatedAt,
    title: String(r.title ?? ''),
    content: String(r.content ?? ''),
    tags: String(r.tags ?? ''),
    imagePath: r.image_path != null ? String(r.image_path) : undefined,
    translationType: r.translation_type != null ? String(r.translation_type) : undefined,
    isIntegrated: Boolean(r.is_integrated),
    threadId: String(r.thread_id ?? ''),
    messageId: String(r.message_id ?? ''),
    discordUrl: String(r.discord_url ?? ''),
    forumId: Number(r.forum_id) || 0,
    savedInputs: savedInputs ?? undefined,
    savedLinkConfigs: savedLinkConfigs ?? undefined,
    savedAdditionalTranslationLinks: Array.isArray(savedAdditionalTranslationLinks)
      ? savedAdditionalTranslationLinks
      : undefined,
    savedAdditionalModLinks: Array.isArray(savedAdditionalModLinks) ? savedAdditionalModLinks : undefined,
    authorDiscordId:
      r.author_discord_id != null && r.author_discord_id !== '' ? String(r.author_discord_id) : undefined,
    authorExternalTranslatorId:
      r.author_external_translator_id != null && r.author_external_translator_id !== ''
        ? String(r.author_external_translator_id)
        : undefined,
    archived: Boolean(r.is_archived),
    templateId: r.template_id != null ? String(r.template_id) : undefined
  };
}
