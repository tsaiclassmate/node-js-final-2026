
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS credit_packages (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  credit_amount INTEGER NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'USER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  experience_years INTEGER NOT NULL,
  description TEXT NOT NULL,
  profile_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS coach_skills (
  coach_id UUID NOT NULL
    REFERENCES coaches(id) ON DELETE CASCADE,

  skill_id UUID NOT NULL
    REFERENCES skills(id) ON DELETE CASCADE,

  PRIMARY KEY (coach_id, skill_id)
);


CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  coach_id UUID NOT NULL
    REFERENCES coaches(id) ON DELETE CASCADE,

  skill_id UUID NOT NULL
    REFERENCES skills(id),

  name VARCHAR(255) NOT NULL,

  description TEXT NOT NULL,

  start_at TIMESTAMPTZ NOT NULL,

  end_at TIMESTAMPTZ NOT NULL,

  max_participants INTEGER NOT NULL,

  meeting_url TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  credit_package_id UUID NOT NULL
    REFERENCES credit_packages(id),

  purchased_credits INTEGER NOT NULL,

  price_paid NUMERIC(10, 2) NOT NULL,

  purchase_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS course_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  course_id UUID NOT NULL
    REFERENCES courses(id) ON DELETE CASCADE,

  status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  cancelled_at TIMESTAMPTZ
);

