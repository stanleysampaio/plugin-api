import { Input } from "@/components/Input/index";
import { Button } from "@/components/button";
import { useEffect, useState } from "react";

type IMCProps = {
  imcResult: {
    imc: number;
    idealWeight: number;
    situation: string;
  };
};

type FormState = {
  bodyCompositionProtocol: string;
  biceps?: number;
  abdominal?: number;
  triceps?: number;
  suprailiac?: number;
  axillaryMid?: number;
  subscapularis?: number;
  thorax?: number;
  thigh?: number;
  medialCalf?: number;
};

export function BodyComposition({ imcResult }: IMCProps) {
  const [bioimpedancia, setBioimpedancia] = useState(false);
  const [localImcResult, setLocalImcResult] = useState(imcResult);
  const [form, setForm] = useState<FormState>({ bodyCompositionProtocol: "1" });
  const [requiredFields, setRequiredFields] = useState<string[]>([]);

  useEffect(() => {
    setLocalImcResult(imcResult);
  }, [imcResult]);

  useEffect(() => {
    updateRequiredFields(form.bodyCompositionProtocol);
  }, [form.bodyCompositionProtocol]);

  const data = [
    { value: "1", label: "3 Pregas: Jackson & Pollock" },
    { value: "2", label: "3 Pregas: Guedes (Características Brasileiras)" },
    { value: "3", label: "4 Pregas: Durnin & Womersley" },
    { value: "4", label: "4 Pregas: Faulkner" },
    { value: "5", label: "4 Pregas: Petroski (Características Brasileiras)" },
    { value: "6", label: "7 Pregas: Jackson, Pollock & Ward" },
  ];

  function handleSelectBioimpedancia() {
    setBioimpedancia((prevState) => !prevState);
  }

  function updateRequiredFields(protocol: string) {
    let fields: string[] = [];
    switch (protocol) {
      case "1":
        fields = ["triceps", "suprailiac", "thigh"];
        break;
      case "2":
        fields = ["triceps", "suprailiac", "abdominal"];
        break;
      case "3":
        fields = ["biceps", "triceps", "suprailiac", "subscapularis"];
        break;
      case "4":
        fields = ["abdominal", "triceps", "suprailiac", "subscapularis"];
        break;
      case "5":
        fields = ["suprailiac", "axillaryMid", "thigh", "medialCalf", "triceps", "subscapularis"];
        break;
      case "6":
        fields = ["abdominal", "triceps", "suprailiac", "axillaryMid", "subscapularis", "thorax", "thigh"];
        break;
      default:
        fields = [];
        break;
    }
    setRequiredFields(fields);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setForm((prevForm) => ({
      ...prevForm,
      [name]: value,
    }));
  }

  return (
    <>
      <div className="">
        <h3 className="text-ecowe-black text-md font-poppins font-semibold ">Composição Corporal</h3>
        <span className="font-poppins text-sm text-ecowe-gray">(Pregas Cutâneas/Bioimpedância)</span>
      </div>
      <div className="flex flex-col rounded-[10px] shadow py-6 px-3">
        <div className="flex gap-4">
          <Button onClick={() => setBioimpedancia(false)} className={` text-md font-normal px-3 mb-3`} type="button" variant = {!bioimpedancia ? "default" : "outline"}>
            Pregas Cutâneas
          </Button>
          <Button onClick={handleSelectBioimpedancia} type="button" className={`text-md font-normal px-3 mb-3`} variant = {bioimpedancia ? "default" : "outline"}>
            Bioimpedância
          </Button>
        </div>
        {
          bioimpedancia ? (
            <div className="space-y-4">
              <div className="flex gap-4 max-lg:flex-col">
                <Input.Root>
                  <Input.Label htmlFor="bmi">IMC</Input.Label>
                  <Input.Content name="bmi" value={localImcResult.imc} readOnly />
                  <Input.Message name="bmi" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="bodyCompositionIdealWeight">Peso Ideal</Input.Label>
                  <Input.Unit unit="kg" name="bodyCompositionIdealWeight" />
                  <Input.Message name="bodyCompositionIdealWeight" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="fatMassPercentage">% Massa Gorda</Input.Label>
                  <Input.Unit unit="%" name="fatMassPercentage" />
                  <Input.Message name="fatMassPercentage" />
                </Input.Root>
              </div>
              <div className="flex gap-4 max-lg:flex-col">
                <Input.Root>
                  <Input.Label htmlFor="fatMass">Massa Gorda</Input.Label>
                  <Input.Unit unit="kg" name="fatMass" />
                  <Input.Message name="fatMass" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="leanMassPercentage">% Massa Magra</Input.Label>
                  <Input.Unit unit="%" name="leanMassPercentage" />
                  <Input.Message name="leanMassPercentage" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="leanMass">massa magra</Input.Label>
                  <Input.Unit unit="kg" name="leanMass" />
                  <Input.Message name="leanMass" />
                </Input.Root>
              </div>
              <div className="flex gap-4 max-lg:flex-col">
                <Input.Root>
                  <Input.Label htmlFor="bodyWaterPercentage">% água corporal</Input.Label>
                  <Input.Unit unit="%" name="bodyWaterPercentage" />
                  <Input.Message name="bodyWaterPercentage" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="bodyWater">água corporal</Input.Label>
                  <Input.Unit unit="l" name="bodyWater" />
                  <Input.Message name="bodyWater" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="boneWeight">peso ósseo</Input.Label>
                  <Input.Unit unit="kg" name="boneWeight" />
                  <Input.Message name="boneWeight" />
                </Input.Root>
              </div>
              <div className="flex gap-4 max-lg:flex-col">
                <Input.Root>
                  <Input.Label htmlFor="residualWeight">peso residual</Input.Label>
                  <Input.Unit unit="kg" name="residualWeight" />
                  <Input.Message name="residualWeight" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="muscleWeight">peso muscular</Input.Label>
                  <Input.Unit unit="kg" name="muscleWeight" />
                  <Input.Message name="muscleWeight" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="visceralFatPercentage">% gordura visceral</Input.Label>
                  <Input.Unit unit="%" name="visceralFatPercentage" />
                  <Input.Message name="visceralFatPercentage" />
                </Input.Root>
              </div>
              <div className="flex gap-4 max-lg:flex-col-reverse">
                <Input.Root>
                  <Input.Label htmlFor="metabolicAge">Idade metabólica</Input.Label>
                  <Input.Content name="metabolicAge" />
                  <Input.Message name="metabolicAge" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="skeletalMuscles">% músculos esqueléticos</Input.Label>
                  <Input.Unit unit="mm" name="skeletalMuscles" />
                  <Input.Message name="skeletalMuscles" />
                </Input.Root>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Input.Root className="mb-4">
                <Input.Label htmlFor="bodyCompositionProtocol" className="font-normal text-ecowe-black">Protocolo</Input.Label>
                <Input.Select name="bodyCompositionProtocol" data={data} className="bg-ecowe-white" onChange={handleChange} value={form.bodyCompositionProtocol} />
              </Input.Root>
              <div className="flex gap-4 max-lg:flex-col">
                <Input.Root>
                  <Input.Label htmlFor="biceps">Biceps</Input.Label>
                  <Input.Unit unit="mm" name="biceps" required={requiredFields.includes("biceps")} className={requiredFields.includes("biceps") ? "border-green-500" : ""} onChange={handleChange} />
                  <Input.Message name="biceps" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="abdominal">Abdominal</Input.Label>
                  <Input.Unit unit="mm" name="abdominal" required={requiredFields.includes("abdominal")} className={requiredFields.includes("abdominal") ? "border-green-500" : ""} onChange={handleChange} />
                  <Input.Message name="abdominal" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="triceps">Tríceps</Input.Label>
                  <Input.Unit unit="mm" name="triceps" required={requiredFields.includes("triceps")} className={requiredFields.includes("triceps") ? "border-green-500" : ""} onChange={handleChange} />
                  <Input.Message name="triceps" />
                </Input.Root>
              </div>
              <div className="flex gap-4 max-lg:flex-col">
                <Input.Root>
                  <Input.Label htmlFor="suprailiac">Suprailíaca</Input.Label>
                  <Input.Unit unit="mm" name="suprailiac" required={requiredFields.includes("suprailiac")} className={requiredFields.includes("suprailiac") ? "border-green-500" : ""} onChange={handleChange} />
                  <Input.Message name="suprailiac" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="axillaryMid">Axilar Média</Input.Label>
                  <Input.Unit unit="mm" name="axillaryMid" required={requiredFields.includes("axillaryMid")} className={requiredFields.includes("axillaryMid") ? "border-green-500" : ""} onChange={handleChange} />
                  <Input.Message name="axillaryMid" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="subscapularis">Subescapular</Input.Label>
                  <Input.Unit unit="mm" name="subscapularis" required={requiredFields.includes("subscapularis")} className={requiredFields.includes("subscapularis") ? "border-green-500" : ""} onChange={handleChange} />
                  <Input.Message name="subscapularis" />
                </Input.Root>
              </div>
              <div className="flex gap-4 max-lg:flex-col">
                <Input.Root>
                  <Input.Label htmlFor="thorax">Tórax</Input.Label>
                  <Input.Unit unit="mm" name="thorax" required={requiredFields.includes("thorax")} className={requiredFields.includes("thorax") ? "border-green-500" : ""} onChange={handleChange} />
                  <Input.Message name="thorax" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="thigh">Coxa</Input.Label>
                  <Input.Unit unit="mm" name="thigh" required={requiredFields.includes("thigh")} className={requiredFields.includes("thigh") ? "border-green-500" : ""} onChange={handleChange} />
                  <Input.Message name="thigh" />
                </Input.Root>
                <Input.Root>
                  <Input.Label htmlFor="medialCalf">Panturrilha Medial</Input.Label>
                  <Input.Unit unit="mm" name="medialCalf" required={requiredFields.includes("medialCalf")} className={requiredFields.includes("medialCalf") ? "border-green-500" : ""} onChange={handleChange} />
                  <Input.Message name="medialCalf" />
                </Input.Root>
              </div>
              <h3 className="capitalize text-lg text-ecowe-black font-poppins font-semibold border-b-[1px] pb-5">Resultados </h3>
              <div className="overflow-x-scroll pb-6">
                <table className="text-left overflow-x-scroll rounded-lg mt-6 ">
                  <thead className="uppercase font-poppins  w-full  ">
                    <tr className="w-full mb-4">
                      <td >
                      </td>
                      <td className="text-center font-semibold pb-4 px-4 text-ecowe-black w-1/4">
                        ATUAL
                      </td>
                      <td className="text-center font-semibold pb-4 px-4 text-ecowe-black w-1/4">
                        RECOMENDAÇÃO
                      </td>
                      <td className="text-center font-semibold pb-4 px-4 text-ecowe-black w-1/4">
                        SITUAÇÃO
                      </td>
                    </tr>
                  </thead>
                  <tbody className="text-center ">
                    <tr className="">
                      <td className="text-start pb-4 px-4  font-semibold  font-poppins text-ecowe-black">
                        IMC
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        {localImcResult.imc}
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        18,50 - 25,00
                      </td>
                      <td className="font-poppins pb-4 px-4 text-secondary">
                        {localImcResult.situation}
                      </td>
                    </tr>
                    <tr className="">
                      <td className="text-start font-semibold pb-4 px-4 font-poppins text-ecowe-black">
                        % Massa Gorda
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        0%
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        71,0% - 84,0%
                      </td>
                      <td className="font-poppins  pb-4 px-4 text-[#FFB800]">
                        Baixo
                      </td>
                    </tr>
                    <tr className="">
                      <td className="text-start font-semibold pb-4 px-4 font-poppins text-ecowe-black">
                        % Massa Magra
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        0%
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        16,0% - 29,0%
                      </td>
                      <td className="font-poppins pb-4 px-4  text-[#FFB800]">
                        Baixo
                      </td>
                    </tr>
                    <tr className="">
                      <td className="text-start font-semibold pb-4 px-4 font-poppins text-ecowe-black">
                        Massa Gorda
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        0 Kg
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        9,68 Kg - 17,55 Kg
                      </td>
                      <td className="font-poppins pb-4 px-4  text-[#FFB800]">
                        Baixo
                      </td>
                    </tr>
                    <tr className="">
                      <td className="text-start pb-4 px-4  font-semibold font-poppins text-ecowe-black">
                        Massa Magra
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        0 KG
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        42,96 Kg - 50,82 Kg
                      </td>
                      <td className="font-poppins pb-4 px-4 text-[#FFB800]">
                        Baixo
                      </td>
                    </tr>
                    <tr className="">
                      <td className="font-semibold text-start pb-4 px-4 font-poppins text-ecowe-black">
                        Densidade Corporal
                      </td>
                      <td className="font-poppins  pb-4 px-4 text-ecowe-black">
                        0
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        -
                      </td>
                      <td className="font-poppins pb-4 px-4 text-ecowe-black">
                        -
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        }
      </div>
    </>
  )
}