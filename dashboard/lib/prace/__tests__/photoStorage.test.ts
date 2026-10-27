import { describe, expect, it } from "vitest";
import { AwsClient } from "aws4fetch";
import { PHOTO_LINK_TTL_SECONDS, createR2Storage, r2ConfigFromEnv, r2ObjectUrl } from "../photoStorage";

describe("R2 úložiště fotografií", () => {
  it("bez kompletních env proměnných není úložiště nastavené (žádné výchozí klíče v kódu)", () => {
    expect(r2ConfigFromEnv({})).toBeNull();
    expect(r2ConfigFromEnv({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "k", R2_BUCKET: "b" })).toBeNull();
    expect(r2ConfigFromEnv({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: "b" })).toMatchObject({ jurisdiction: "eu" });
  });

  it("výchozí je EU jurisdikce (data v EU)", () => {
    expect(r2ObjectUrl({ accountId: "acc", bucket: "fotky", jurisdiction: "eu" }, "prace/t/x.jpg")).toBe(
      "https://acc.eu.r2.cloudflarestorage.com/fotky/prace/t/x.jpg"
    );
  });

  it("odkaz na fotku je podepsaný, platí 5 minut a vynucuje image/jpeg", async () => {
    const storage = createR2Storage({ accountId: "acc", accessKeyId: "AK", secretAccessKey: "SK", bucket: "fotky", jurisdiction: "eu" });
    const url = new URL(await storage.signedGetUrl("prace/t/x.jpg"));
    expect(url.host).toBe("acc.eu.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/fotky/prace/t/x.jpg");
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(PHOTO_LINK_TTL_SECONDS));
    expect(PHOTO_LINK_TTL_SECONDS).toBe(300);
    expect(url.searchParams.get("response-content-type")).toBe("image/jpeg");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^AK\/\d{8}\/auto\/s3\/aws4_request$/);
  });

  it("podepisování odpovídá oficiálnímu příkladu AWS SigV4 (presigned GET)", async () => {
    const client = new AwsClient({
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      service: "s3",
      region: "us-east-1",
    });
    const signed = await client.sign(
      new Request("https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Expires=86400", { method: "GET" }),
      { aws: { signQuery: true, datetime: "20130524T000000Z" } }
    );
    expect(new URL(signed.url).searchParams.get("X-Amz-Signature")).toBe(
      "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
    );
  });
});
