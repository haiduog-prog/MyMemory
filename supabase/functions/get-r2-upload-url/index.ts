// supabase/functions/get-r2-upload-url/index.ts
// Supabase Edge Function (Deno Runtime) to generate Cloudflare R2 Presigned URLs

import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@^3.758.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@^3.758.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  fileName: string;
  fileType: string;
  fileSize?: number;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { fileName, fileType } = (await req.json()) as RequestBody;

    if (!fileName || !fileType) {
      return new Response(
        JSON.stringify({ error: "fileName and fileType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountId = Deno.env.get("R2_ACCOUNT_ID");
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucketName = Deno.env.get("R2_BUCKET_NAME");
    const publicDomain = Deno.env.get("R2_PUBLIC_DOMAIN"); // e.g. https://pub-xxx.r2.dev or https://media.yourdomain.com

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicDomain) {
      return new Response(
        JSON.stringify({
          error: "Cloudflare R2 environment variables are not fully configured in Supabase Secrets.",
          missing: {
            R2_ACCOUNT_ID: !accountId,
            R2_ACCESS_KEY_ID: !accessKeyId,
            R2_SECRET_ACCESS_KEY: !secretAccessKey,
            R2_BUCKET_NAME: !bucketName,
            R2_PUBLIC_DOMAIN: !publicDomain,
          },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize S3 client for Cloudflare R2
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Sanitize extension and generate unique file key
    const fileExt = fileName.split(".").pop()?.toLowerCase() || "bin";
    const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
    const key = `uploads/${uniqueFileName}`;

    // Create Presigned PUT command (valid for 15 minutes)
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

    // Format public URL
    const cleanPublicDomain = publicDomain.replace(/\/+$/, "");
    const publicUrl = `${cleanPublicDomain}/${key}`;

    return new Response(
      JSON.stringify({
        uploadUrl,
        publicUrl,
        key,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
