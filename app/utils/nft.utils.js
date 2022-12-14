const fs = require('fs');
const path = require('path');
const retry = require('async-retry');
const axios = require('axios');

const { randomInteger } = require('./randomInteger');
const {
  calculateCosmeticTier,
  calculateStatTier,
} = require('./calculateTiers');
const {
  heroTierImagesIpfsUrls,
  heroTierEnum,
  cosmeticPointsForTraits,
  nftStages,
  uploadIpfsType,
  cosmeticTraitsMap,
  skillsMap,
} = require('../variables/nft.variables');
const pool = require('../config/db.config');

const { getPinataCredentials } = require('./pinata');
const { updateMetaplexMetadata, fetchOldMetadata } = require('./solana');
const { addUploadIpfs } = require('../queues/uploadIpfs.queue');
const { addBlenderRender } = require('../queues/blenderRender.queue');
const { Connection } = require('@solana/web3.js');
const { getParsedNftAccountsByUpdateAuthority } = require('@nfteyez/sol-rayz');
const { camelCase } = require('lodash');

const blenderOutputFolderPathRelative = '../../../blender_output/';
const metadataFolderPath = '../../../metadata/';
const { pinataApiKey, pinataSecretApiKey, pinataGateway } =
  getPinataCredentials();
const keypair = path.resolve(__dirname, `../../../keypair.json`);

exports.throwErrorTokenAlreadyRevealed = (tokenAddress) => {
  throw new Error(
    `Token ${tokenAddress.slice(0, 8)}... has already been revealed`
  );
};

exports.throwErrorTokenHasNotBeenRevealed = (tokenAddress) => {
  throw new Error(`Token ${tokenAddress.slice(0, 8)}... has not been revealed`);
};

exports.throwErrorTokenAlreadyCustomized = (tokenAddress) => {
  throw new Error(`Token ${tokenAddress.slice(0, 8)}... already customized`);
};

exports.throwErrorTokenHasNotBeenCustomized = (tokenAddress) => {
  throw new Error(
    `Token ${tokenAddress.slice(0, 8)}... has not been customized`
  );
};

exports.checkIsTokenAlreadyRevealed = async (tokenAddress) => {
  const isTokenAlreadyRevealedQuery = await pool.query(
    'SELECT EXISTS(SELECT 1 FROM tokens WHERE token_address = $1)',
    [tokenAddress]
  );

  const isTokenAlreadyRevealed = isTokenAlreadyRevealedQuery?.rows[0]?.exists;
  return isTokenAlreadyRevealed;
};

exports.checkIsTokenAlreadyCustomized = async (tokenId) => {
  const isTokenAlreadyCustomizedQuery = await pool.query(
    'SELECT EXISTS(SELECT 1 FROM characters WHERE nft_id = $1)',
    [tokenId]
  );

  const isTokenAlreadyCustomized = isTokenAlreadyCustomizedQuery.rows[0].exists;
  return isTokenAlreadyCustomized;
};

exports.getHeroTierImageFromIpfs = (heroTier) => {
  if (heroTier === heroTierEnum.common) {
    return heroTierImagesIpfsUrls.common;
  } else if (heroTier === heroTierEnum.uncommon) {
    return heroTierImagesIpfsUrls.uncommon;
  } else if (heroTier === heroTierEnum.rare) {
    return heroTierImagesIpfsUrls.rare;
  } else if (heroTier === heroTierEnum.epic) {
    return heroTierImagesIpfsUrls.epic;
  } else if (heroTier === heroTierEnum.legendary) {
    return heroTierImagesIpfsUrls.legendary;
  } else if (heroTier === heroTierEnum.mythic) {
    return heroTierImagesIpfsUrls.mythic;
  }
};

exports.selectTokenByAddress = async (tokenAddress) => {
  const tokenQuery = await pool.query(
    'SELECT * FROM tokens WHERE token_address = $1',
    [tokenAddress]
  );
  const token = tokenQuery?.rows?.[0];
  return token;
};

exports.selectCharacterByTokenId = async (tokenId) => {
  const characterQuery = await pool.query(
    'SELECT * FROM characters WHERE nft_id = $1',
    [tokenId]
  );
  const character = characterQuery?.rows?.[0];
  return character;
};

exports.checkIsSkillsValid = (statPoints, skills) => {
  const totalSkills = Object.values(skills).reduce((a, b) => a + b, 0);

  return totalSkills === statPoints ? true : false;
};

exports.checkIsTraitsValid = (cosmeticPoints, cosmeticTraits) => {
  const {
    sex,
    faceStyle,
    skinTone,
    eyeDetail,
    eyes,
    facialHair,
    glasses,
    hairStyle,
    hairColor,
    necklace,
    earring,
    nosePiercing,
    scar,
    tattoo,
    background,
  } = cosmeticTraits;

  const sexCP = cosmeticPointsForTraits.sexes[sex];
  const faceStyleCP = cosmeticPointsForTraits.faceStyles[faceStyle];
  const skinToneCP = cosmeticPointsForTraits.skinTones[skinTone];
  const eyeDetailCP = cosmeticPointsForTraits.eyeDetails[eyeDetail];
  const eyesCP = cosmeticPointsForTraits.eyes[eyes];
  const facialHairCP = cosmeticPointsForTraits.facialHair[facialHair];
  const glassesCP = cosmeticPointsForTraits.glasses[glasses];
  const hairStyleCP = cosmeticPointsForTraits.hairStyles[hairStyle];
  const hairColorCP = cosmeticPointsForTraits.hairColors[hairColor];
  const necklaceCP = cosmeticPointsForTraits.necklaces[necklace];
  const earringCP = cosmeticPointsForTraits.earrings[earring];
  const nosePiercingCP = cosmeticPointsForTraits.nosePiercing[nosePiercing];
  const scarCP = cosmeticPointsForTraits.scars[scar];
  const tattooCP = cosmeticPointsForTraits.tattoos[tattoo];
  const backgroundCP = cosmeticPointsForTraits.backgrounds[background];

  const cosmeticPointsSpent =
    sexCP +
    faceStyleCP +
    skinToneCP +
    eyeDetailCP +
    eyesCP +
    facialHairCP +
    glassesCP +
    hairStyleCP +
    hairColorCP +
    necklaceCP +
    earringCP +
    nosePiercingCP +
    scarCP +
    tattooCP +
    backgroundCP;

  return cosmeticPointsSpent <= cosmeticPoints ? true : false;
};

exports.getRandomTokenFromTome = async (tome) => {
  return await retry(
    async () => {
      // Select all possible tokens from tome
      let allTokensFromTome;
      if (tome === 'Woodland Respite') {
        allTokensFromTome = await pool.query('SELECT * FROM woodland_respite');
      } else if (tome === 'Dawn of Man') {
        allTokensFromTome = await pool.query('SELECT * FROM dawn_of_man');
      }

      // Select all already revealed tokens from tome
      const revealedTokensFromTome = await pool.query(
        'SELECT * FROM tokens WHERE tome = $1',
        [tome]
      );

      const allTokenNumbers = Array.from(
        { length: allTokensFromTome?.rows.length },
        (_, i) => i + 1
      );

      const revealedTokenNumbers = revealedTokensFromTome?.rows.map(
        (item) => item?.token_number
      );
      const revealedTokenNumbersSet = new Set(revealedTokenNumbers);

      const remainingTokenNumbers = allTokenNumbers.filter(
        (item) => !revealedTokenNumbersSet.has(item)
      );

      if (remainingTokenNumbers.length <= 0) {
        throw new Error(`All tokens already revealed`);
      }

      const randomTokenNumberIndex = randomInteger(
        0,
        remainingTokenNumbers.length - 1
      );

      const selectedTokenNumber = remainingTokenNumbers[randomTokenNumberIndex];

      const {
        token_number: tokenNumber,
        stat_points: statPoints,
        cosmetic_points: cosmeticPoints,
        hero_tier: heroTier,
      } = allTokensFromTome.rows.find(
        (item) => item?.token_number === selectedTokenNumber
      );

      const statTier = calculateStatTier(statPoints, tome);
      const cosmeticTier = calculateCosmeticTier(cosmeticPoints);

      return {
        tokenNumber,
        statPoints,
        cosmeticPoints,
        statTier,
        cosmeticTier,
        heroTier,
      };
    },
    {
      retries: 5,
    }
  );
};

exports.checkIsTokenIdUnique = async (tokenId) => {
  const isTokenIdExistQuery = await pool.query(
    'SELECT EXISTS(SELECT 1 FROM characters WHERE token_id = $1)',
    [tokenId]
  );

  const isTokenIdExist = isTokenIdExistQuery?.rows?.[0]?.exists;

  return isTokenIdExist;
};

exports.updateSolanaMetadataAfterCustomization = async (
  connection,
  cosmeticTraits,
  currentNft,
  tokenAddress,
  oldMetadata,
  tokenName,
  skills,
  rerenderedImageUrl
) => {
  const cosmeticAttributes = Object.entries(cosmeticTraits).map((item) => ({
    trait_type: cosmeticTraitsMap[item[0]],
    value: item[1],
  }));
  const skillsAttributes = Object.entries(skills).map((item) => ({
    trait_type: skillsMap[item[0]],
    value: item[1],
  }));

  const {
    tome,
    stat_points,
    cosmetic_points,
    stat_tier,
    cosmetic_tier,
    hero_tier,
    mint_name,
  } = currentNft;

  const attributes = [...cosmeticAttributes, ...skillsAttributes];

  const imageUrl = rerenderedImageUrl ? rerenderedImageUrl : oldMetadata?.image;

  const attributesSet = new Set();
  const uniqueAttributes = attributes.filter((item) =>
    !attributesSet.has(JSON.stringify(item))
      ? attributesSet.add(JSON.stringify(item))
      : false
  );

  const metadata = {
    ...oldMetadata,
    image: imageUrl,
    external_url: `${process.env.WEBSITE_URL}`,
    properties: {
      ...oldMetadata?.properties,
      files: [
        {
          uri: imageUrl,
          type: rerenderedImageUrl ? 'image/jpeg' : 'image/png',
        },
      ],
    },
    name: tokenName,
    mint_name,
    attributes: [
      {
        trait_type: 'Stage',
        value: 'Hero',
      },
      {
        trait_type: 'Tome',
        value: tome,
      },
      {
        trait_type: 'Hero Tier',
        value: hero_tier,
      },
      {
        trait_type: 'Stat Tier',
        value: stat_tier,
      },
      {
        trait_type: 'Cosmetic Tier',
        value: cosmetic_tier,
      },
      {
        trait_type: 'Stat Points',
        value: stat_points,
      },
      {
        trait_type: 'Cosmetic Points',
        value: cosmetic_points,
      },
      ...uniqueAttributes,
    ],
  };

  const uploadJsonIpfs = await addUploadIpfs({
    type: uploadIpfsType.json,
    pinataApiKey,
    pinataSecretApiKey,
    pinataGateway,
    data: metadata,
    tokenAddress,
    stage: nftStages.customized,
  });
  const uploadJsonIpfsResult = await uploadJsonIpfs.finished();

  const { metadataIpfsUrl, metadataIpfsHash } = uploadJsonIpfsResult;

  const metadataJSON = JSON.stringify(metadata, null, 2);
  fs.writeFileSync(
    path.resolve(__dirname, `${metadataFolderPath}${metadataIpfsHash}.json`),
    metadataJSON
  );

  await pool.query(
    'INSERT INTO metadata (nft_id, stage, metadata_url, image_url) VALUES($1, $2, $3, $4) RETURNING *',
    [currentNft.id, nftStages.customized, metadataIpfsUrl, imageUrl]
  );

  await updateMetaplexMetadata(
    connection,
    keypair,
    tokenAddress,
    metadataIpfsUrl,
    tokenName
  );

  return { metadataIpfsUrl };
};

exports.renderImageAndUpdateMetadata = async (
  tokenId,
  cosmeticTraits,
  currentNft,
  tokenAddress
) => {
  const blenderRender = await addBlenderRender({
    tokenId,
    cosmeticTraits,
    heroTier: currentNft?.hero_tier,
    tokenAddress,
  });
  await blenderRender.finished();

  const image = path.resolve(
    __dirname,
    `${blenderOutputFolderPathRelative}${tokenId}.jpg`
  );

  const uploadImageIpfs = await addUploadIpfs({
    type: uploadIpfsType.image,
    pinataApiKey,
    pinataSecretApiKey,
    pinataGateway,
    data: image,
    tokenAddress,
    stage: nftStages.customized,
  });
  const uploadImageIpfsResult = await uploadImageIpfs.finished();

  const { imageIpfsHash, imageIpfsUrl } = uploadImageIpfsResult;

  const metadataImagePath = path.resolve(
    __dirname,
    `${metadataFolderPath}${imageIpfsHash}.jpg`
  );

  fs.copyFile(image, metadataImagePath, (err) => {
    if (err) throw err;
  });

  return { imageIpfsUrl };
};

exports.fetchTokenNameStatus = async (tokenId) => {
  const tokenNameData = await pool.query(
    'SELECT * FROM token_names WHERE nft_id = $1 ORDER BY updated_at DESC LIMIT 1',
    [tokenId]
  );

  if (!tokenNameData || tokenNameData.rows.length === 0) {
    return null;
  }

  const tokenNameStatus = tokenNameData.rows[0]?.token_name_status;

  if (!tokenNameStatus) {
    return null;
  }

  return tokenNameStatus;
};

exports.getMetaData = async (tokenData) => {
  return await retry(
    async () => {
      let metaData = {};
      if (tokenData) {
        const metaDataUri = tokenData.data?.uri;

        const response = await axios.get(metaDataUri);

        if (response && response.data.image) {
          metaData = response.data;
        }
      }
      return metaData;
    },
    {
      retries: 5,
    }
  );
};

exports.generateNftsMetadata = async () => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const connection = new Connection(process.env.MAINNET_CLUSTER_URL);

    const parsedNfts = await retry(
      async () => {
        return await getParsedNftAccountsByUpdateAuthority({
          updateAuthority: process.env.UPDATE_AUTHORITY_PRODUCTION,
          connection,
        });
      },
      {
        retries: 5,
      }
    );

    const filteredNfts = parsedNfts.filter(
      (nft) =>
        nft.mint.toBase58() !== 'BHMurHBSfVJuvMCSvYBTb3GmWGRX1S18Ui8XZf7fGc9n'
    );

    const nftsWithMetadataPrevious = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, `../../allNftsWithMetadata.json`))
    );

    // eslint-disable-next-line no-undef
    const nftsWithMetadata = await Promise.all(
      filteredNfts.map(async (nft) => {
        const mint = nft.mint.toBase58();
        const name = nft.data.name.replaceAll('\u0000', '');
        const symbol = nft.data.symbol.replaceAll('\u0000', '');
        const uri = nft.data.uri.replaceAll('\u0000', '');

        const nftPrevious = nftsWithMetadataPrevious.find(
          (nftPrevious) => nftPrevious.mint === mint
        );

        let oldMetadata;
        if (nftPrevious && nftPrevious?.data?.uri === uri) {
          oldMetadata = nftPrevious?.data?.customMetaData;
        } else {
          oldMetadata = await fetchOldMetadata(mint, uri);
          const attributes = oldMetadata?.attributes.reduce(
            (obj, item) =>
              Object.assign(obj, { [camelCase(item.trait_type)]: item.value }),
            {}
          );

          oldMetadata = { ...oldMetadata, attributes };
        }

        return {
          ...nft,
          data: {
            ...nft.data,
            name,
            symbol,
            uri,
            customMetaData: oldMetadata,
          },
        };
      })
    );

    const metadataJSON = JSON.stringify(nftsWithMetadata, null, 2);
    fs.writeFileSync(
      path.resolve(__dirname, `../../allNftsWithMetadata.json`),
      metadataJSON
    );

    console.log(`allNftsWithMetadata.json updated ${Date.now()}`);
  }
};
