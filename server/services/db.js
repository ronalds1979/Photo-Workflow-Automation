import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

const genreOptions = [
  { id: 'GEN01', name: 'Action' },
  { id: 'GEN02', name: 'Adventure' },
  { id: 'GEN03', name: 'Animation' },
  { id: 'GEN04', name: 'Comedy' },
  { id: 'GEN05', name: 'Crime' },
  { id: 'GEN06', name: 'Documentary' },
  { id: 'GEN07', name: 'Drama' },
  { id: 'GEN08', name: 'Fantasy' },
  { id: 'GEN09', name: 'Science Fiction' },
  { id: 'GEN10', name: 'Horror' },
  { id: 'GEN11', name: 'Musical' },
  { id: 'GEN12', name: 'Romance' },
  { id: 'GEN13', name: 'Thriller' },
  { id: 'GEN14', name: 'War' },
  { id: 'GEN15', name: 'Western' },
  { id: 'GEN16', name: 'Biography' },
  { id: 'GEN17', name: 'History' },
  { id: 'GEN18', name: 'Family' },
];

let genreSeedPromise;

export const seedGenres = () => {
  if (!genreSeedPromise) {
    genreSeedPromise = prisma.$transaction(
      genreOptions.map(({ id, name }) => prisma.genre.upsert({
        where: { id },
        update: { name },
        create: { id, name },
      })),
    ).catch((error) => {
      genreSeedPromise = undefined;
      throw error;
    });
  }
  return genreSeedPromise;
};
