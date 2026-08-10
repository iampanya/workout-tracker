import { describe, it, expect } from "vitest";
import {
  createExerciseSchema,
  createRoutineSchema,
  addRoutineExerciseSchema,
  startSessionSchema,
  logSetSchema,
  usernameSchema,
  loginSchema,
  signupSchema,
} from "./validation";

describe("createExerciseSchema", () => {
  it("accepts a valid custom exercise", () => {
    const result = createExerciseSchema.safeParse({ name: "Cable Fly", muscleGroup: "Chest" });
    expect(result.success).toBe(true);
  });
  it("rejects an empty name", () => {
    const result = createExerciseSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
  it("rejects a missing muscle group", () => {
    const result = createExerciseSchema.safeParse({ name: "Cable Fly" });
    expect(result.success).toBe(false);
  });
  it("rejects a muscle group outside the fixed set", () => {
    const result = createExerciseSchema.safeParse({ name: "Cable Fly", muscleGroup: "Cardio" });
    expect(result.success).toBe(false);
  });
});

describe("createRoutineSchema", () => {
  it("accepts a name-only routine", () => {
    expect(createRoutineSchema.safeParse({ name: "Push Day" }).success).toBe(true);
  });
  it("rejects a missing name", () => {
    expect(createRoutineSchema.safeParse({}).success).toBe(false);
  });
});

describe("addRoutineExerciseSchema", () => {
  it("accepts a valid entry", () => {
    const result = addRoutineExerciseSchema.safeParse({
      routineId: "11111111-1111-4111-b111-111111111111",
      exerciseId: "22222222-2222-4222-b222-222222222222",
      position: 0,
    });
    expect(result.success).toBe(true);
  });
  it("rejects a negative position", () => {
    const result = addRoutineExerciseSchema.safeParse({
      routineId: "11111111-1111-4111-b111-111111111111",
      exerciseId: "22222222-2222-4222-b222-222222222222",
      position: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("startSessionSchema", () => {
  it("accepts a freeform session with a date", () => {
    expect(startSessionSchema.safeParse({ sessionDate: "2026-01-05" }).success).toBe(true);
  });
  it("rejects a malformed date", () => {
    expect(startSessionSchema.safeParse({ sessionDate: "01/05/2026" }).success).toBe(false);
  });
});

describe("logSetSchema", () => {
  it("accepts a valid set", () => {
    const result = logSetSchema.safeParse({
      sessionExerciseId: "11111111-1111-4111-b111-111111111111",
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });
    expect(result.success).toBe(true);
  });
  it("rejects zero or negative weight", () => {
    const result = logSetSchema.safeParse({
      sessionExerciseId: "11111111-1111-4111-b111-111111111111",
      weightKg: 0,
      reps: 5,
      isWarmup: false,
    });
    expect(result.success).toBe(false);
  });
  it("rejects zero or negative reps", () => {
    const result = logSetSchema.safeParse({
      sessionExerciseId: "11111111-1111-4111-b111-111111111111",
      weightKg: 100,
      reps: 0,
      isWarmup: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("usernameSchema", () => {
  it("lowercases a valid mixed-case username", () => {
    const result = usernameSchema.safeParse("Panya_P1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("panya_p1");
  });
  it("rejects usernames shorter than 3 characters", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });
  it("rejects usernames longer than 30 characters", () => {
    expect(usernameSchema.safeParse("a".repeat(31)).success).toBe(false);
  });
  it("rejects disallowed characters", () => {
    expect(usernameSchema.safeParse("bad name!").success).toBe(false);
    expect(usernameSchema.safeParse("dot.name").success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a username and password", () => {
    expect(loginSchema.safeParse({ username: "Panya", password: "secret" }).success).toBe(true);
  });
  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ username: "panya", password: "" }).success).toBe(false);
  });
});

describe("signupSchema", () => {
  it("accepts a valid signup and lowercases the username", () => {
    const result = signupSchema.safeParse({
      username: "NewUser",
      email: "new@example.com",
      password: "password123",
      inviteCode: "abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.username).toBe("newuser");
  });
  it("rejects an invalid email", () => {
    expect(
      signupSchema.safeParse({
        username: "newuser",
        email: "not-an-email",
        password: "password123",
        inviteCode: "abc123",
      }).success
    ).toBe(false);
  });
  it("rejects a password shorter than 6 characters", () => {
    expect(
      signupSchema.safeParse({
        username: "newuser",
        email: "new@example.com",
        password: "short",
        inviteCode: "abc123",
      }).success
    ).toBe(false);
  });
  it("rejects a missing invite code", () => {
    expect(
      signupSchema.safeParse({
        username: "newuser",
        email: "new@example.com",
        password: "password123",
        inviteCode: "",
      }).success
    ).toBe(false);
  });
});
