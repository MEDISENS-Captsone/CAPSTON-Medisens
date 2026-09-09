-- MediSens verified core-schema candidate baseline.
-- Source: quarantined public-schema-only export, SHA-256 B8D2A6479D09935B2271D82038AEE8A73D981D59CA405DD0426897EACA734E49.
-- Scope: core tables, sequences, defaults, constraints, and indexes required before the additive July 2026 migration chain.
-- Excluded deliberately: post-baseline tables, functions, triggers, RLS policies, grants, analytics_private objects, and columns/constraints introduced by dated migrations.
-- Later migrations remain responsible for their own additive behavior.

CREATE TABLE IF NOT EXISTS "public"."patient_archive_events" (
    "id" bigint NOT NULL,
    "patient_id" bigint NOT NULL,
    "event_type" "text" NOT NULL,
    "performed_by" "uuid",
    "performed_by_role" "text",
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE "public"."patient_archive_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "user_name" "text",
    "user_role" "text",
    "action" "text" NOT NULL,
    "module" "text" NOT NULL,
    "record_id" "text",
    "record_type" "text",
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "audit_logs_metadata_object_chk" CHECK (("jsonb_typeof"("metadata") = 'object'::"text"))
);

ALTER TABLE "public"."audit_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."consultation" (
    "consultation_id" bigint NOT NULL,
    "patient_id" bigint,
    "family_history" "text",
    "smoking_status" "text",
    "smoking_sticks_per_day" bigint,
    "smoking_years" bigint,
    "drinking_status" "text",
    "drinking_frequency" "text",
    "drinking_years" bigint,
    "immunization_history" "text",
    "menarche_age" bigint,
    "sexual_onset_age" bigint,
    "is_menopause" "text",
    "menopause_age" bigint,
    "lmp" "text",
    "interval_cycle" "text",
    "period_duration" "text",
    "pads_per_day" bigint,
    "birth_control_method" "text",
    "gravidity" bigint,
    "parity" bigint,
    "delivery_type" "text",
    "full_term_count" bigint,
    "premature_count" bigint,
    "abortion_count" bigint,
    "living_children_count" bigint,
    "pre_eclampsia" "text",
    "medication_treatment" "text",
    "past_med_surge_history" "text",
    "chief_complaints" "text",
    "diagnosis" "text",
    "hpi" "text",
    "assessment" "text",
    "plan" "text",
    "follow_up_date" "text",
    "follow_up_time" "text",
    "management_treatment" "text",
    "attending_provider" "text",
    "past_med_surg_history" "text",
    "initial_consultation_id" bigint,
    "history_present_illness" "text",
    "follow_up_status" "text" DEFAULT 'pending'::"text"
);

ALTER TABLE "public"."consultation" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."initial_consultation" (
    "initialconsultation_id" bigint NOT NULL,
    "patient_id" bigint,
    "consultation_date" "text",
    "consultation_time" "text",
    "mode_of_transaction" "text",
    "referred_by" "text",
    "mode_of_transfer" "text",
    "chief_complaint" "text",
    "diagnosis" "text"
);

ALTER TABLE "public"."initial_consultation" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."fhsis_logs" (
    "id" bigint NOT NULL,
    "patient_id" bigint,
    "category" "text" NOT NULL,
    "data_fields" "jsonb" NOT NULL,
    "report_month" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "encoded_by" "uuid"
);

ALTER TABLE "public"."fhsis_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."follow_up" (
    "followup_id" bigint NOT NULL,
    "patient_id" bigint,
    "consultation_id" bigint,
    "visit_date" "text",
    "visit_time" "text",
    "mode_of_transaction" "text",
    "mode_of_transfer" "text",
    "chief_complaint" "text",
    "diagnosis" "text",
    "history_of_present_illness" "text",
    "bp" "text",
    "heart_rate" bigint,
    "respiratory_rate" bigint,
    "temperature" double precision,
    "o2_saturation" bigint,
    "weight" double precision,
    "height" double precision,
    "muac" double precision,
    "nutritional_status" "text",
    "bmi" double precision,
    "visual_acuity_left" "text",
    "visual_acuity_right" "text",
    "blood_type" "text",
    "general_survey" "text",
    "medication_treatment" "text",
    "lab_results" "text",
    "signature_url" "text",
    "follow_up_status" "text" DEFAULT 'pending'::"text",
    "reminder_sent_at" timestamp with time zone,
    "reminder_error" "text"
);

ALTER TABLE "public"."follow_up" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" bigint NOT NULL,
    "firstName" "text",
    "middleName" "text",
    "lastName" "text",
    "age" bigint,
    "sex" "text",
    "nationality" "text",
    "bloodType" "text",
    "address" "text",
    "contactNumber" bigint,
    "religion" "text",
    "birthday" "text",
    "birthPlace" "text",
    "educationalAttain" "text",
    "employmentStatus" "text",
    "relativeName" "text",
    "relativeRelation" "text",
    "relativeAddress" "text",
    "philhealthNo" "text",
    "philhealthStatus" "text",
    "category" "text",
    "categoryOthers" "text",
    "consent_signed" boolean DEFAULT false,
    "civilStatus" "text",
    "suffix" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "relativeContact" "text",
    "archive_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "uuid",
    "archive_reason" "text",
    "archive_reviewed_at" timestamp with time zone,
    "archive_reviewed_by" "uuid",
    "archive_protected" boolean DEFAULT false NOT NULL,
    "archive_protection_reason" "text",
    "last_activity_at" timestamp with time zone
);

ALTER TABLE "public"."patients" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."lab_request" (
    "labrequest_id" bigint NOT NULL,
    "consultation_id" bigint,
    "patient_id" bigint,
    "request_date" "text",
    "lab_no" "text",
    "chief_complaint" "text",
    "is_cbc" boolean,
    "is_cbc_platelet" boolean,
    "is_hgb_hct" boolean,
    "is_xray" boolean,
    "is_ultrasound" boolean,
    "is_rbs" boolean,
    "is_fbs" boolean,
    "is_uric_acid" boolean,
    "is_cholesterol" boolean,
    "is_urinalysis" boolean,
    "is_fecalysis" boolean,
    "is_sputum" boolean,
    "others" "text",
    "requested_by" "text",
    "status" "text",
    "is_clinical_microscopy" boolean DEFAULT false,
    "is_blood_chemistry" boolean DEFAULT false,
    "is_pregnancy_test" boolean DEFAULT false,
    "is_hbsag_screening" boolean DEFAULT false,
    "is_hiv_screening" boolean DEFAULT false,
    "is_parasitology" boolean DEFAULT false,
    "is_dengue_rdt" boolean DEFAULT false
);

ALTER TABLE "public"."lab_request" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."lab_result" (
    "labresult_id" bigint NOT NULL,
    "labrequest_id" bigint,
    "patient_id" bigint,
    "date_performed" "text",
    "findings" "text",
    "performed_by" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "consultation_id" bigint
);

ALTER TABLE "public"."lab_result" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."prescription" (
    "prescription_id" bigint NOT NULL,
    "consultation_id" bigint,
    "patient_id" bigint,
    "prescription_date" "text",
    "rx_content" "text",
    "doctor_name" "text",
    "license_no" bigint,
    "ptr_no" "text",
    "status" "text",
    "dispensed_at" "text",
    "signature_url" "text"
);

ALTER TABLE "public"."prescription" OWNER TO "postgres";

ALTER TABLE "public"."audit_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."consultation" ALTER COLUMN "consultation_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."consultation_consultation_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."fhsis_logs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."fhsis_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."follow_up" ALTER COLUMN "followup_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."follow_up_followup_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."initial_consultation" ALTER COLUMN "initialconsultation_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."initial_consultation_initialconsultation_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."lab_request" ALTER COLUMN "labrequest_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."lab_request_labrequest_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."lab_result" ALTER COLUMN "labresult_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."lab_result_labresult_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."patient_archive_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."patient_archive_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."patient_consent" (
    "consent_id" bigint NOT NULL,
    "patient_id" bigint,
    "consent_signer" boolean DEFAULT false,
    "consent_signature" "text",
    "consent_personnel" "text",
    "consent_personnel_signature" "text",
    "consent_date" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."patient_consent" OWNER TO "postgres";

ALTER TABLE "public"."patient_consent" ALTER COLUMN "consent_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."patient_consent_consent_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."patients" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."patients_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."prescription" ALTER COLUMN "prescription_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."prescription_prescription_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "full_name" "text",
    "email" "text"
);

ALTER TABLE "public"."profiles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."vital_sign" (
    "vitals_id" bigint NOT NULL,
    "patient_id" bigint,
    "bp" "text",
    "heart_rate" bigint,
    "respiratory_rate" bigint,
    "temperature" double precision,
    "o2_saturation" bigint,
    "weight" double precision,
    "height" bigint,
    "muac" double precision,
    "nutritional_status" "text",
    "bmi" double precision,
    "visual_acuity_left" "text",
    "visual_acuity_right" "text",
    "general_survey" "text",
    "initial_consultation_id" bigint
);

ALTER TABLE "public"."vital_sign" OWNER TO "postgres";

-- This legacy narrow policy is a verified pre-migration dependency. It is not
-- created or dropped by the later chain, and 20260810115857 asserts it exists
-- before performing its clinical RLS remediation.
CREATE POLICY "Doctors can update follow_ups"
ON "public"."follow_up"
FOR UPDATE TO "authenticated"
USING (
  EXISTS (
    SELECT 1
    FROM "public"."profiles"
    WHERE "profiles"."id" = "auth"."uid"()
      AND "profiles"."role" = 'doctor'::"text"
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "public"."profiles"
    WHERE "profiles"."id" = "auth"."uid"()
      AND "profiles"."role" = 'doctor'::"text"
  )
);

ALTER TABLE "public"."vital_sign" ALTER COLUMN "vitals_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."vital_sign_vitals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "Patients_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."consultation"
    ADD CONSTRAINT "consultation_pkey" PRIMARY KEY ("consultation_id");

ALTER TABLE ONLY "public"."fhsis_logs"
    ADD CONSTRAINT "fhsis_logs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."follow_up"
    ADD CONSTRAINT "follow_up_pkey" PRIMARY KEY ("followup_id");

ALTER TABLE ONLY "public"."initial_consultation"
    ADD CONSTRAINT "inital_consultation_pkey" PRIMARY KEY ("initialconsultation_id");

ALTER TABLE ONLY "public"."lab_request"
    ADD CONSTRAINT "lab_request_pkey" PRIMARY KEY ("labrequest_id");

ALTER TABLE ONLY "public"."lab_result"
    ADD CONSTRAINT "lab_result_pkey" PRIMARY KEY ("labresult_id");

ALTER TABLE "public"."patient_archive_events"
    ADD CONSTRAINT "patient_archive_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['archived'::"text", 'restored'::"text", 'protection_added'::"text", 'protection_removed'::"text", 'reviewed'::"text"]))) NOT VALID;

ALTER TABLE ONLY "public"."patient_archive_events"
    ADD CONSTRAINT "patient_archive_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."patient_consent"
    ADD CONSTRAINT "patient_consent_pkey" PRIMARY KEY ("consent_id");

ALTER TABLE "public"."patients"
    ADD CONSTRAINT "patients_archive_status_check" CHECK (("archive_status" = ANY (ARRAY['active'::"text", 'archived'::"text"]))) NOT VALID;

ALTER TABLE ONLY "public"."prescription"
    ADD CONSTRAINT "prescription_pkey" PRIMARY KEY ("prescription_id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."patient_consent"
    ADD CONSTRAINT "unique_patient_id" UNIQUE ("patient_id");

ALTER TABLE ONLY "public"."vital_sign"
    ADD CONSTRAINT "vital_sign_pkey" PRIMARY KEY ("vitals_id");

CREATE INDEX "audit_logs_action_created_at_idx" ON "public"."audit_logs" USING "btree" ("action", "created_at" DESC);

CREATE INDEX "audit_logs_created_at_idx" ON "public"."audit_logs" USING "btree" ("created_at" DESC);

CREATE INDEX "audit_logs_module_created_at_idx" ON "public"."audit_logs" USING "btree" ("module", "created_at" DESC);

CREATE INDEX "audit_logs_record_lookup_idx" ON "public"."audit_logs" USING "btree" ("record_type", "record_id", "created_at" DESC);

CREATE INDEX "audit_logs_user_id_created_at_idx" ON "public"."audit_logs" USING "btree" ("user_id", "created_at" DESC);

CREATE INDEX "audit_logs_user_role_created_at_idx" ON "public"."audit_logs" USING "btree" ("user_role", "created_at" DESC);

CREATE INDEX "idx_patient_consent_patient_id" ON "public"."patient_consent" USING "btree" ("patient_id");

CREATE INDEX "patient_archive_events_event_type_created_idx" ON "public"."patient_archive_events" USING "btree" ("event_type", "created_at" DESC);

CREATE INDEX "patient_archive_events_patient_created_idx" ON "public"."patient_archive_events" USING "btree" ("patient_id", "created_at" DESC);

CREATE INDEX "patients_archive_protected_idx" ON "public"."patients" USING "btree" ("archive_protected");

CREATE INDEX "patients_archive_status_idx" ON "public"."patients" USING "btree" ("archive_status");

CREATE INDEX "patients_archive_status_last_activity_idx" ON "public"."patients" USING "btree" ("archive_status", "last_activity_at");

CREATE INDEX "patients_archived_at_idx" ON "public"."patients" USING "btree" ("archived_at");

CREATE INDEX "patients_last_activity_at_idx" ON "public"."patients" USING "btree" ("last_activity_at");

ALTER TABLE ONLY "public"."consultation"
    ADD CONSTRAINT "consultation_initial_consultation_id_fkey" FOREIGN KEY ("initial_consultation_id") REFERENCES "public"."initial_consultation"("initialconsultation_id");

ALTER TABLE ONLY "public"."consultation"
    ADD CONSTRAINT "consultation_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");

ALTER TABLE ONLY "public"."fhsis_logs"
    ADD CONSTRAINT "fhsis_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."follow_up"
    ADD CONSTRAINT "followup_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("consultation_id");

ALTER TABLE ONLY "public"."follow_up"
    ADD CONSTRAINT "followup_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");

ALTER TABLE ONLY "public"."initial_consultation"
    ADD CONSTRAINT "inital_consultation_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");

ALTER TABLE ONLY "public"."lab_request"
    ADD CONSTRAINT "lab_request_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("consultation_id");

ALTER TABLE ONLY "public"."lab_result"
    ADD CONSTRAINT "lab_result_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("consultation_id");

ALTER TABLE ONLY "public"."lab_result"
    ADD CONSTRAINT "lab_result_labrequest_id_fkey" FOREIGN KEY ("labrequest_id") REFERENCES "public"."lab_request"("labrequest_id");

ALTER TABLE ONLY "public"."lab_result"
    ADD CONSTRAINT "lab_result_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");

ALTER TABLE ONLY "public"."patient_archive_events"
    ADD CONSTRAINT "patient_archive_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");

ALTER TABLE ONLY "public"."patient_archive_events"
    ADD CONSTRAINT "patient_archive_events_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."patient_consent"
    ADD CONSTRAINT "patient_consent_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_archive_reviewed_by_fkey" FOREIGN KEY ("archive_reviewed_by") REFERENCES "auth"."users"("id") NOT VALID;

ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "auth"."users"("id") NOT VALID;

ALTER TABLE ONLY "public"."prescription"
    ADD CONSTRAINT "prescription_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("consultation_id");

ALTER TABLE ONLY "public"."prescription"
    ADD CONSTRAINT "prescription_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."vital_sign"
    ADD CONSTRAINT "vital_sign_initial_consultation_id_fkey" FOREIGN KEY ("initial_consultation_id") REFERENCES "public"."initial_consultation"("initialconsultation_id");

ALTER TABLE ONLY "public"."vital_sign"
    ADD CONSTRAINT "vital_sign_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");

-- Verified pre-July security baseline. These objects are present in the
-- approved schema-only dump, but are neither created nor replaced by the
-- timestamped migration chain. In particular, staff login reads its own
-- profile through the Data API, so both the table grant and own-row policy
-- must exist before the later security hardening migrations run.
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON "public"."profiles"
FOR SELECT TO "authenticated"
USING (("id" = "auth"."uid"()));

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";

-- The July archive-field migration replaces only the patient UPDATE policy.
-- The verified core CREATE/SELECT policies must be available before it.
ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can create patients" ON "public"."patients"
FOR INSERT TO "authenticated"
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."profiles"
    WHERE "profiles"."id" = "auth"."uid"()
      AND "profiles"."role" = ANY (ARRAY['doctor'::"text", 'nurse'::"text", 'BHW'::"text"])
  )
);

CREATE POLICY "Staff can read patients" ON "public"."patients"
FOR SELECT TO "authenticated"
USING (
  EXISTS (
    SELECT 1 FROM "public"."profiles"
    WHERE "profiles"."id" = "auth"."uid"()
      AND "profiles"."role" = ANY (ARRAY['doctor'::"text", 'nurse'::"text", 'BHW'::"text", 'midwives'::"text"])
  )
);

GRANT ALL ON TABLE "public"."patients" TO "anon";
GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";

-- These read-only audit/archive policies and grants have no timestamped
-- migration source, and are therefore retained from the verified core dump.
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and doctor can view audit logs" ON "public"."audit_logs"
FOR SELECT TO "authenticated"
USING (
  EXISTS (
    SELECT 1 FROM "public"."profiles" "p"
    WHERE "p"."id" = "auth"."uid"()
      AND "p"."role" = ANY (ARRAY['admin'::"text", 'doctor'::"text"])
  )
);

GRANT SELECT, INSERT, REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON TABLE "public"."audit_logs" TO "anon";
GRANT SELECT, INSERT, REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";

ALTER TABLE "public"."patient_archive_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nurse and doctor can view patient archive events" ON "public"."patient_archive_events"
FOR SELECT TO "authenticated"
USING (
  EXISTS (
    SELECT 1 FROM "public"."profiles" "p"
    WHERE "p"."id" = "auth"."uid"()
      AND "p"."role" = ANY (ARRAY['nurse'::"text", 'doctor'::"text"])
  )
);

GRANT ALL ON TABLE "public"."patient_archive_events" TO "anon";
GRANT ALL ON TABLE "public"."patient_archive_events" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_archive_events" TO "service_role";

