-- CreateTable
CREATE TABLE "TestItem" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,

    CONSTRAINT "TestItem_pkey" PRIMARY KEY ("id")
);
