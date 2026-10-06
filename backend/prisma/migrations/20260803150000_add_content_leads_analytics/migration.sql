CREATE TYPE "LeadStatus" AS ENUM ('novo', 'contatado', 'qualificado', 'convertido', 'perdido', 'arquivado');
CREATE TYPE "BlogPostStatus" AS ENUM ('rascunho', 'agendado', 'publicado');

CREATE TABLE "visit_sessions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "anonymous_visitor_id" TEXT NOT NULL,
  "anonymous_session_id" TEXT NOT NULL,
  "first_path" TEXT NOT NULL,
  "referrer" TEXT,
  "utm_source" TEXT,
  "utm_medium" TEXT,
  "utm_campaign" TEXT,
  "utm_content" TEXT,
  "utm_term" TEXT,
  "device_category" TEXT,
  "browser_family" TEXT,
  "ip_hash" TEXT,
  "is_bot" BOOLEAN NOT NULL DEFAULT false,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "visit_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "page_views" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "navigation_id" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "page_title" TEXT,
  "referrer" TEXT,
  "utm_source" TEXT,
  "utm_medium" TEXT,
  "utm_campaign" TEXT,
  "utm_content" TEXT,
  "utm_term" TEXT,
  "device_category" TEXT,
  "article_slug" TEXT,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leads" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "session_id" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "city" TEXT,
  "state" TEXT,
  "pet_name" TEXT,
  "pet_type" TEXT,
  "interest" TEXT NOT NULL,
  "preferred_contact_time" TEXT,
  "privacy_accepted" BOOLEAN NOT NULL,
  "privacy_accepted_at" TIMESTAMP(3) NOT NULL,
  "privacy_purpose" TEXT NOT NULL,
  "status" "LeadStatus" NOT NULL DEFAULT 'novo',
  "source_page" TEXT,
  "referrer" TEXT,
  "utm_source" TEXT,
  "utm_medium" TEXT,
  "utm_campaign" TEXT,
  "utm_content" TEXT,
  "utm_term" TEXT,
  "notes" TEXT,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "blog_categories" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "blog_posts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "content_format" TEXT NOT NULL DEFAULT 'markdown',
  "cover_image" TEXT,
  "cover_image_alt" TEXT,
  "author_name" TEXT NOT NULL,
  "author_id" TEXT,
  "category_id" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "BlogPostStatus" NOT NULL DEFAULT 'rascunho',
  "seo_title" TEXT,
  "seo_description" TEXT,
  "social_image" TEXT,
  "published_at" TIMESTAMP(3),
  "scheduled_for" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visit_sessions_tenant_id_anonymous_session_id_key" ON "visit_sessions"("tenant_id", "anonymous_session_id");
CREATE INDEX "visit_sessions_tenant_id_started_at_idx" ON "visit_sessions"("tenant_id", "started_at");
CREATE INDEX "visit_sessions_tenant_id_anonymous_visitor_id_idx" ON "visit_sessions"("tenant_id", "anonymous_visitor_id");
CREATE INDEX "visit_sessions_tenant_id_utm_source_idx" ON "visit_sessions"("tenant_id", "utm_source");
CREATE INDEX "visit_sessions_tenant_id_utm_campaign_idx" ON "visit_sessions"("tenant_id", "utm_campaign");
CREATE UNIQUE INDEX "page_views_session_id_navigation_id_key" ON "page_views"("session_id", "navigation_id");
CREATE INDEX "page_views_tenant_id_occurred_at_idx" ON "page_views"("tenant_id", "occurred_at");
CREATE INDEX "page_views_tenant_id_path_idx" ON "page_views"("tenant_id", "path");
CREATE INDEX "page_views_tenant_id_utm_source_idx" ON "page_views"("tenant_id", "utm_source");
CREATE INDEX "page_views_tenant_id_utm_campaign_idx" ON "page_views"("tenant_id", "utm_campaign");
CREATE INDEX "page_views_tenant_id_article_slug_idx" ON "page_views"("tenant_id", "article_slug");
CREATE INDEX "leads_tenant_id_created_at_idx" ON "leads"("tenant_id", "created_at");
CREATE INDEX "leads_tenant_id_status_idx" ON "leads"("tenant_id", "status");
CREATE INDEX "leads_tenant_id_source_page_idx" ON "leads"("tenant_id", "source_page");
CREATE INDEX "leads_tenant_id_utm_campaign_idx" ON "leads"("tenant_id", "utm_campaign");
CREATE INDEX "leads_tenant_id_session_id_idx" ON "leads"("tenant_id", "session_id");
CREATE UNIQUE INDEX "blog_categories_tenant_id_slug_key" ON "blog_categories"("tenant_id", "slug");
CREATE INDEX "blog_categories_tenant_id_name_idx" ON "blog_categories"("tenant_id", "name");
CREATE UNIQUE INDEX "blog_posts_tenant_id_slug_key" ON "blog_posts"("tenant_id", "slug");
CREATE INDEX "blog_posts_tenant_id_status_published_at_idx" ON "blog_posts"("tenant_id", "status", "published_at");
CREATE INDEX "blog_posts_tenant_id_category_id_idx" ON "blog_posts"("tenant_id", "category_id");
CREATE INDEX "blog_posts_tenant_id_scheduled_for_idx" ON "blog_posts"("tenant_id", "scheduled_for");

ALTER TABLE "page_views" ADD CONSTRAINT "page_views_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "visit_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "visit_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "blog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
